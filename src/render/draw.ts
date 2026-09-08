import { clamp, lerp, TAU } from "../core/math";
import type { PropKind } from "../data/biomes";
import { COSMETICS_BY_ID } from "../data/cosmetics";
import { ELEMENT_COLORS } from "../data/elements";
import { RARITY_COLORS } from "../data/rarity";
import { RELIC_BY_ID } from "../data/relics";
import { getStatusSpec } from "../combat/status";
import { REVIVE_TIME, type Dungeon, type Hero } from "../game/dungeon";
import type { Body, Enemy, GroundZone, Pickup, Telegraph } from "../game/entities";
import type { Level, Trap } from "../game/level";
import { Fx } from "./fx";
import { atlasCanvas, atlasTileset } from "./atlas/index";
import { ATLAS } from "./atlas/manifest";
import { gradedTileset, paintTilemap } from "./tilemap";
import {
  heroKey, heroSprite, itemSprite, silhouette, silhouetteCanvas, sprite, spriteFeet, spriteWorldScale,
  tinted, tintedCanvas, weaponGlow, weaponGrip, weaponSprite, weaponWorldScale, type SpriteName,
  relicSprite,
} from "./sprites";

/**
 * World units per sprite pixel. Change this and `WEAPON_SCALE` together, and only
 * together — if the character grid's authoring resolution ever changes, this and the
 * boss `spriteScale` table in `data/bosses.ts` have to move the other way in the same
 * commit or every hitbox will lie about what's on screen.
 */
const SPRITE_SCALE = 1.2;
/**
 * Weapons are drawn larger than their pixel size relative to bodies — a sword ends up
 * about as long as the character is tall, which is both the genre convention and closer
 * to the reach the hitbox actually has than a scrupulously realistic one would be.
 */
const WEAPON_SCALE = 1.5;
/** How long a swing's animation runs. Mirrors `SWING_TIME` in the simulation. */
const SWING_DRAW_TIME = 0.13;
/** Seconds between motes of a cosmetic aura. Slow on purpose; it's jewellery. */
const AURA_INTERVAL = 0.09;
/**
 * Screen pixels per world unit. Tuned so sprites read as chunky pixel art while most
 * of the arena still fits on screen — enemies you can't see aren't fun to dodge.
 */
export const ZOOM = 2.2;

const ENEMY_SPRITES: Record<string, SpriteName> = {
  grunt: "grunt", archer: "archer", brute: "brute",
  swarmer: "swarmer", caster: "caster", boss: "boss",
  // New archetype roles (UAT §2) reuse the closest existing silhouette until the art
  // pipeline lands bespoke ones — mapped by combat shape, not by name.
  charger: "grunt", bomber: "swarmer", shieldbearer: "brute",
  summoner: "caster", sniper: "archer", leech: "caster",
};

/** Interpolated position, so motion is smooth between fixed simulation ticks. */
function lerpPos(b: Body, alpha: number): { x: number; y: number } {
  return { x: lerp(b.px, b.x, alpha), y: lerp(b.py, b.y, alpha) };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number, y: number,
  flip: boolean,
  scale = SPRITE_SCALE,
  feet = 0.22,
): void {
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  // Anchored at the feet so taller sprites stand on the same ground line. Procedural
  // grids carry ~22% empty space under the feet; a trimmed atlas PNG passes its own
  // (near-zero) fraction so it doesn't hover.
  ctx.drawImage(canvas, -w / 2, -h + h * feet, w, h);
  ctx.restore();
}

const PROP_SPRITES: Record<PropKind, SpriteName> = {
  torch: "torch", bones: "bones", mushroom: "mushroom", crystal: "crystal", rock: "rock",
  // The Delve set pieces have no procedural grid — they're atlas-only (see PROP_ATLAS).
  // These fallbacks only matter for the frame or two before the PNGs finish loading.
  brazier: "torch", statue: "rock", altar: "rock", sarcophagus: "rock", gibbet: "bones", skulls: "bones",
  handstone: "rock", urn: "rock", pillar: "rock", casket: "rock", wargrave: "bones",
};

/**
 * Delve dungeon dressing — atlas-only props with no procedural equivalent. Drawn
 * straight from the loaded PNG at the manifest's world scale, with a light wash
 * toward the biome's wall colour so one grimdark set sells every circle. A prop
 * whose PNG hasn't loaded falls through to its `PROP_SPRITES` stand-in.
 */
const PROP_ATLAS: Partial<Record<PropKind, string>> = {
  brazier: "prop.delve-brazier",
  statue: "prop.delve-statue",
  altar: "prop.delve-altar",
  sarcophagus: "prop.delve-sarcophagus",
  gibbet: "prop.delve-gibbet",
  skulls: "prop.delve-skulls",
  handstone: "prop.reliquary-hand",
  urn: "prop.reliquary-urn",
  pillar: "prop.reliquary-pillar",
  casket: "prop.reliquary-casket",
  wargrave: "prop.reliquary-wargrave",
};

/** Non-weapon gear on the floor. Weapons draw as the actual weapon instead. */
export class WorldRenderer {
  private camX = 0;
  private camY = 0;
  private initialized = false;
  /** The floor is static for the life of a level, so it's painted once and blitted. */
  private floorCanvas: HTMLCanvasElement | null = null;
  private floorFor: Level | null = null;
  /** True when this floor's walls are baked into `floorCanvas` by a tileset — the
   *  per-frame `drawWalls` pass is then skipped, since there's nothing left for it. */
  private floorTiled = false;
  /** Aura motes are emitted from the render loop, so they need their own clock. */
  private auraClock = 0;
  private lastElapsed = 0;

  /**
   * The inverse of the camera transform `render` sets up, for turning a mouse position
   * into the world point it's over. One frame behind the very latest camera lerp at
   * worst, which is well under the threshold of noticing on a cursor.
   */
  screenToWorld(screenX: number, screenY: number, viewW: number, viewH: number): { x: number; y: number } {
    return {
      x: this.camX + (screenX - viewW / 2) / ZOOM,
      y: this.camY + (screenY - viewH / 2) / ZOOM,
    };
  }

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

    this.emitAura(fx, dungeon, hero.x, hero.y);

    const shake = fx.shakeOffset();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-this.camX + shake.x, -this.camY + shake.y);

    this.drawFloor(ctx, dungeon);
    this.drawGround(ctx, dungeon);
    this.drawTraps(ctx, dungeon);
    this.drawTelegraphs(ctx, dungeon);
    if (!this.floorTiled) this.drawWalls(ctx, dungeon.level);
    this.drawProps(ctx, dungeon.level);
    this.drawResourceNodes(ctx, dungeon);
    this.drawPortal(ctx, dungeon);
    this.drawPickups(ctx, dungeon, alpha);
    this.drawCorpses(ctx, dungeon);
    this.drawTotems(ctx, dungeon);
    this.drawMinions(ctx, dungeon, alpha);
    this.drawActors(ctx, dungeon, alpha);
    this.drawProjectiles(ctx, dungeon, alpha);
    fx.draw(ctx);

    ctx.restore();
  }

  /**
   * Trails whatever cosmetic aura the player is wearing. It runs off the simulation
   * clock rather than real time so it stops dead when the game is paused, which is what
   * everything else on screen does.
   */
  private emitAura(fx: Fx, d: Dungeon, x: number, y: number): void {
    const id = d.appearance.aura;
    const dt = Math.max(0, Math.min(0.1, d.elapsed - this.lastElapsed));
    this.lastElapsed = d.elapsed;
    if (!id) { this.auraClock = 0; return; }
    const cosmetic = COSMETICS_BY_ID[id];
    if (!cosmetic?.aura) return;
    this.auraClock += dt;
    while (this.auraClock >= AURA_INTERVAL) {
      this.auraClock -= AURA_INTERVAL;
      fx.aura(x, y, cosmetic.aura.kind, cosmetic.aura.color);
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    if (this.floorFor !== d.level || !this.floorCanvas) {
      const baked = bakeFloor(d.level, d.config.mode.tileset);
      this.floorCanvas = baked.canvas;
      this.floorTiled = baked.tiled;
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
      // A Delve set piece: draw the atlas PNG directly, washed toward the biome's
      // wall colour so the same grimdark set reads as this circle's stone. The
      // brazier keeps its own fire.
      const atlasId = PROP_ATLAS[p.kind];
      if (atlasId) {
        const png = atlasCanvas(atlasId);
        const meta = ATLAS[atlasId];
        if (png && meta) {
          const lit = p.kind === "brazier";
          // Wash stone/bone dressing toward the biome's *shadow* colour: it drops
          // the brightness (PixelLab authors bone too pale for a grimdark floor)
          // and tints the piece into this circle at the same time. The brazier
          // keeps its own fire.
          const canvas = lit ? png : tintedCanvas(png, atlasId, level.biome.wallSide, 0.42);
          ctx.save();
          ctx.globalAlpha = 0.95;
          if (lit) {
            ctx.shadowColor = "#ff8a3c";
            ctx.shadowBlur = 16;
          }
          drawSprite(ctx, canvas, p.x, p.y, false, meta.worldScale * p.scale, meta.feet);
          ctx.restore();
          continue;
        }
        // PNG not loaded yet — fall through to the PROP_SPRITES stand-in below.
      }

      const name = PROP_SPRITES[p.kind];
      // Crystals and rubble take the biome's colors; the rest are authored as-is.
      const canvas =
        p.kind === "crystal" ? tinted(name, level.biome.accent, 0.5)
        : p.kind === "rock" ? tinted(name, level.biome.wall, 0.65)
        : sprite(name);
      // A pipeline prop carries its own world scale and feet; a procedural one rides the
      // old fixed 1.25.
      const scale = (spriteWorldScale(name) ?? 1.25) * p.scale;
      const feet = spriteFeet(name) ?? 0.22;
      ctx.save();
      ctx.globalAlpha = 0.9;
      if (p.kind === "torch" || p.kind === "brazier") {
        ctx.shadowColor = "#ff8a3c";
        ctx.shadowBlur = 14;
      }
      drawSprite(ctx, canvas, p.x, p.y, false, scale, feet);
      ctx.restore();
    }
  }

  /**
   * Planet floors only. A live node is a glowing crystal tinted the planet's element,
   * with a pulsing ring so it reads as interactable rather than decoration — the same
   * "stand here and press confirm" affordance a portal gives you. A mined one goes flat
   * grey and stops glowing so it's obvious there's nothing left to take.
   */
  private drawResourceNodes(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    const planet = d.config.planet?.spec;
    if (!planet) return;
    const color = ELEMENT_COLORS[planet.element];
    for (const node of d.level.resourceNodes) {
      ctx.save();
      if (!node.depleted) {
        const pulse = 0.5 + Math.sin(d.elapsed * 4) * 0.2;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6 + Math.sin(d.elapsed * 3) * 2, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        drawSprite(ctx, tinted("crystal", color, 0.7), node.x, node.y, false, 1.4);
      } else {
        ctx.globalAlpha = 0.45;
        drawSprite(ctx, tinted("crystal", "#6b7480", 0.7), node.x, node.y, false, 1.1);
      }
      ctx.restore();
    }
  }

  private drawTraps(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const t of d.level.traps) drawTrap(ctx, t, d.elapsed);
  }

  /**
   * Boss telegraphs. This is the most important thing on the screen: the shape says
   * where the damage will be and the sweep says how long you have. Everything else in
   * the render can be pretty; this has to be legible.
   */
  private drawTelegraphs(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const t of d.telegraphs) drawTelegraph(ctx, t, d.elapsed);
  }

  /** Whatever a mechanic left burning on the floor. */
  private drawGround(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const g of d.ground) drawGroundZone(ctx, g, d.elapsed);
  }

  private drawPortal(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    // The entrance portal: an exit for the whole floor, so it must never look sealed —
    // but it never descends either, so it stays the dim amber "way back" even after a
    // clear. Amber rather than blue is the tell that leaving through it costs you
    // something while the floor is unfinished (UAT §6).
    const done = d.canDescend;
    const { x, y } = d.portal;
    drawPortalGlyph(ctx, x, y, d.elapsed, done ? "#6b7480" : "#c08a3e", done ? 0.3 : 0.34);

    // The completion portal, once the quota is met: the bright one, the way onward.
    const cp = d.completionPortal;
    if (cp) drawPortalGlyph(ctx, cp.x, cp.y, d.elapsed, "#7dd3fc", 1);
  }

  private drawPickups(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    for (const p of d.pickups) {
      const { x, y } = lerpPos(p, alpha);
      // Gentle bob so drops read as loose objects rather than floor decals.
      const bob = Math.sin((d.elapsed + p.life) * 6) * 2;
      const { canvas, scale } = pickupSprite(p);
      ctx.save();
      if (p.rarity) {
        ctx.shadowColor = RARITY_COLORS[p.rarity];
        ctx.shadowBlur = 12;
      } else if (p.kind === "gem") {
        ctx.shadowColor = "#f0abfc";
        ctx.shadowBlur = 14;
      }
      // Weapons lie flat on the floor rather than standing on end.
      const flat = p.kind === "item" && !!p.item?.family;
      if (flat) {
        ctx.translate(x, y + bob);
        ctx.rotate(-0.35);
        drawSprite(ctx, canvas, 0, 0, false, scale);
      } else {
        drawSprite(ctx, canvas, x, y + bob, false, scale);
      }
      ctx.restore();
    }
  }

  /**
   * Totems. They're stakes in the ground with something angry tied to the top, and
   * they need a pulse ring so you can see the moment one goes off.
   */
  private drawTotems(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const t of d.totems) {
      const fade = clamp(t.remaining / 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(d.elapsed * 6);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 16 + Math.sin(d.elapsed * 5) * 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.fillStyle = t.color;
      ctx.fillRect(t.x - 2, t.y - 16, 4, 20);
      ctx.beginPath();
      ctx.arc(t.x, t.y - 18, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Slain-monster bodies fading on the floor — the Necromancer's raw material. */
  private drawCorpses(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const c of d.corpsePile) {
      ctx.save();
      ctx.globalAlpha = clamp(c.remaining / 10, 0, 1) * 0.5;
      ctx.fillStyle = "#3a2f33";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 9, 5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Summoned combatants. Small, plain bodies in their owner's element — a legion should
   * read as a swarm of yours, not be mistaken for more monsters.
   */
  private drawMinions(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    for (const m of d.minions) {
      const { x, y } = lerpPos(m, alpha);
      const color = ELEMENT_COLORS[m.element] ?? "#9fd3ff";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(m.facing);
      ctx.fillStyle = m.hitFlash > 0 ? "#ffffff" : color;
      ctx.beginPath();
      ctx.moveTo(m.radius + 2, 0);
      ctx.lineTo(-m.radius, m.radius * 0.8);
      ctx.lineTo(-m.radius, -m.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (m.windup > 0) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, m.radius + 3, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (m.health < m.maxHealth) healthBar(ctx, x, y - m.radius * 2.4, m.health / m.maxHealth, 18);
    }
  }

  private drawActors(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    // Painter's algorithm on the Y axis so nearer things overlap farther ones.
    const drawables: { y: number; draw: () => void }[] = [];

    for (const e of d.enemies) {
      const pos = lerpPos(e, alpha);
      drawables.push({ y: pos.y, draw: () => this.drawEnemy(ctx, e, pos.x, pos.y, d.elapsed) });
    }
    // Everybody on the floor, sorted into the same painter's pass as the monsters —
    // an ally standing behind a grunt is drawn behind it, same as you are.
    for (const hero of d.heroes) {
      const pos = lerpPos(hero.avatar, alpha);
      drawables.push({ y: pos.y, draw: () => this.drawHero(ctx, d, hero, pos.x, pos.y) });
    }
    drawables.sort((a, b) => a.y - b.y);

    for (const item of drawables) {
      shadow(ctx, item.y);
      item.draw();
    }
  }

  private drawHero(ctx: CanvasRenderingContext2D, d: Dungeon, hero: Hero, x: number, y: number): void {
    const a = hero.avatar;
    const classColor = hero.player.heroClass.color;
    const hs = heroSprite(hero.appearance);
    blob(ctx, x, y, 9);

    // Somebody whose browser left the room: a ghost of a body and no revive meter, since
    // nothing brings them back (UAT §1 A1). Kept on the floor so the party doesn't lose
    // track of where they fell, but there's deliberately nothing here to go and do.
    if (hero.departed) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      drawSprite(ctx, hs.canvas, x, y + 4, false, hs.scale, hs.feet);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#9aa4b2";
      ctx.font = "7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${hero.name.toUpperCase()} LEFT`, x, y - 30);
      ctx.restore();
      return;
    }

    // A downed ally is a slumped, faded body with a revive meter over it. Standing on
    // them is the whole interaction, so it has to be obvious from across the room.
    if (hero.downed) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      drawSprite(ctx, hs.canvas, x, y + 4, false, hs.scale, hs.feet);
      ctx.restore();
      const pct = clamp(hero.reviveProgress / REVIVE_TIME, 0, 1);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - 16, y - 26, 32, 4);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(x - 16, y - 26, 32 * pct, 4);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ef4444";
      ctx.font = "7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(hero.local ? "DOWN" : hero.name.toUpperCase(), x, y - 30);
      ctx.restore();
      return;
    }

    // In a party everyone needs a name over their head, yours included — four identical
    // silhouettes in a scrum is exactly when you most need to know which one is you.
    if (d.isParty) {
      ctx.save();
      ctx.globalAlpha = hero.local ? 0.55 : 0.9;
      ctx.fillStyle = hero.local ? "#9aa4b2" : classColor;
      ctx.font = "7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(hero.name.toUpperCase(), x, y - 30);
      ctx.restore();
    }

    // A ring at the feet plus a pip in the facing direction, in your class's colour. The
    // body is now yours to dress however you like, so this ring is what tells you which
    // of a dozen sprites in a crowd is the one you're driving — it never changes.
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = classColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = classColor;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a.facing) * 17, y + 2 + Math.sin(a.facing) * 7, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();

    // The ward reads as a bubble, because that is what everyone expects a shield to
    // look like and this is not the place to be clever.
    if (hero.ward > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(d.elapsed * 6) * 0.1;
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 6, 20, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#c084fc";
      ctx.fill();
      ctx.restore();
    }

    const flip = Math.cos(a.facing) < 0;
    // Facing away from the camera puts the weapon behind the body, which is the whole
    // reason the two are drawn separately rather than baked into one sprite.
    const behind = Math.sin(a.facing) < -0.25;
    if (behind) this.drawWeapon(ctx, hero, x, y);

    const body = hs.canvas;
    const key = heroKey(hero.appearance);
    // Blink during i-frames so it's obvious when you're safe.
    const blinking = a.invulnTimer > 0 && Math.floor(d.elapsed * 22) % 2 === 0;
    ctx.save();
    if (a.dashTimer > 0) ctx.globalAlpha = 0.65;
    if (a.hitFlash > 0) {
      drawSprite(ctx, silhouetteCanvas(body, key, "#ff6b6b"), x, y, flip, hs.scale, hs.feet);
    } else {
      if (blinking) ctx.globalAlpha *= 0.45;
      drawSprite(ctx, body, x, y, flip, hs.scale, hs.feet);
    }
    ctx.restore();

    if (!behind) this.drawWeapon(ctx, hero, x, y);
  }

  /**
   * The weapon in your hand, drawn as the thing it actually is and animated along the
   * swing the simulation resolved. Everything else about a build is a number on a menu;
   * this is the one part of it you can see from across the room.
   */
  private drawWeapon(ctx: CanvasRenderingContext2D, hero: Hero, x: number, y: number): void {
    const a = hero.avatar;
    const spec = hero.player.weapon;
    const item = hero.player.equipment.weapon;
    const skinId = hero.appearance.weapon;
    const rarity = item?.rarity ?? null;
    const canvas = weaponSprite(spec.id, skinId, rarity);
    const grip = weaponGrip(spec.id);
    const glow = weaponGlow(skinId, rarity);
    // A pipeline weapon is authored much larger than a legacy grid; it carries its own
    // world scale so its reach still matches the family it replaced.
    const wscale = weaponWorldScale(spec.id) ?? WEAPON_SCALE;

    const swinging = a.swingTimer > 0;
    const t = swinging ? clamp(1 - a.swingTimer / SWING_DRAW_TIME, 0, 1) : 0;
    // At rest the weapon is held out to one side; in a swing it follows the same arc,
    // thrust or spin the hitbox took.
    let angle = a.facing + 0.45;
    let hold = 7;
    if (swinging) {
      switch (spec.pattern) {
        case "thrust":
          angle = a.swingAngle;
          hold = 6 + spec.reach * 0.3 * t;
          break;
        case "bolt":
          angle = a.swingAngle - 0.55 + t * 0.35;
          hold = 8;
          break;
        case "orb":
          angle = a.swingAngle + t * TAU;
          hold = 11;
          break;
        default: {
          const spread = Math.min(spec.arc, TAU - 0.01);
          angle = a.swingAngle - spread / 2 + spread * t;
          hold = 9;
        }
      }
    }

    const px = x + Math.cos(angle) * hold;
    const py = y - 8 + Math.sin(angle) * hold;
    ctx.save();
    if (a.dashTimer > 0) ctx.globalAlpha = 0.65;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 9;
    }
    ctx.translate(px, py);
    ctx.rotate(angle);
    // Mirror across the weapon's own axis when it points left, or the art hangs upside
    // down for half of the compass.
    if (Math.cos(angle) < 0) ctx.scale(1, -1);
    ctx.drawImage(
      canvas,
      -grip.x * wscale, -grip.y * wscale,
      canvas.width * wscale, canvas.height * wscale,
    );
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, x0: number, y0: number, time: number): void {
    const name: SpriteName = e.boss ? e.boss.spec.sprite : ENEMY_SPRITES[e.archetype.kind] ?? "grunt";
    // A pipeline sprite carries its own world scale and feet offset; a procedural one
    // rides the global constant (or the boss's own tuned `spriteScale`).
    const atlasScale = spriteWorldScale(name);
    // An elite is a mini-boss — draw its body noticeably larger so it reads as a threat
    // before the health bar or the aura do (UAT §4: "immediately recognizable").
    const eliteScale = e.elite && !e.boss ? 1.4 : 1;
    const scale = (atlasScale ?? (e.boss ? e.boss.spec.spriteScale : SPRITE_SCALE)) * eliteScale;
    const feet = spriteFeet(name) ?? 0.22;
    // A slow bob, phase-shifted by position so a pack doesn't breathe in unison. The
    // shadow stays put: it's the body that hops, not the monster's footing.
    const x = x0;
    const y = y0 - (e.boss ? 0 : Math.abs(Math.sin(time * 3.4 + x0 * 0.07)) * 1.6);
    blob(ctx, x0, y0, e.radius);

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
      drawSprite(ctx, sprite(name), x, y, false, scale, feet);
      ctx.restore();
      return;
    }

    const flip = Math.cos(e.facing) < 0;

    // Elite aura, in the rarity color that also determines its loot — heavier now that an
    // elite is a mini-boss, plus a chevron overhead so it's spotted across the room.
    if (e.elite && !e.boss) {
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(time * 4) * 0.12;
      ctx.strokeStyle = RARITY_COLORS[e.elite];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y - e.radius * 0.5, e.radius * 1.7, 0, TAU);
      ctx.stroke();
      const my = y - e.radius * 3.1 + Math.sin(time * 3) * 1.5;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = RARITY_COLORS[e.elite];
      ctx.beginPath();
      ctx.moveTo(x, my + 6);
      ctx.lineTo(x - 6, my - 3);
      ctx.lineTo(x + 6, my - 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (e.elite) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(time * 4) * 0.1;
      ctx.strokeStyle = RARITY_COLORS[e.elite];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - e.radius * 0.5, e.radius * 1.6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Affix markers (UAT §3): a dashed ring in the lead affix's tint, and each affix's
    // glyph orbiting the body so the "oh shit, it has THAT one" read happens at a glance.
    if (e.affixes.length > 0 && !e.boss) {
      const ringR = e.radius * 1.95;
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(time * 3) * 0.12;
      ctx.strokeStyle = e.affixes[0]!.visual.tint;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(x, y - e.radius * 0.4, ringR, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      e.affixes.forEach((af, i) => {
        const ang = time * 1.5 + (i / e.affixes.length) * TAU;
        ctx.fillStyle = af.visual.tint;
        ctx.fillText(af.visual.glyph, x + Math.cos(ang) * ringR, y - e.radius * 0.4 + Math.sin(ang) * ringR);
      });
      ctx.restore();
    }

    // A boss winding something up glows in its own element — the same colour as the
    // shape it is about to paint on the floor, so the two read as one warning.
    const casting = e.boss ? e.boss.castTimer > 0 : false;
    if (e.hitFlash > 0 && e.boss) {
      // A boss is being hit constantly. A full white silhouette would strobe for the
      // entire fight and hide the thing you're supposed to be reading, so it only
      // brightens.
      drawSprite(ctx, tinted(name, "#ffffff", 0.4), x, y, flip, scale, feet);
    } else if (e.hitFlash > 0) {
      drawSprite(ctx, silhouette(name), x, y, flip, scale, feet);
    } else if (casting) {
      drawSprite(ctx, tinted(name, ELEMENT_COLORS[e.boss!.spec.element], 0.55), x, y, flip, scale, feet);
    } else if (e.windup > 0) {
      // Flash red while winding up — this is the player's cue to dash.
      drawSprite(ctx, silhouette(name, "#ff8a5c"), x, y, flip, scale, feet);
    } else if (e.elite) {
      drawSprite(ctx, tinted(name, RARITY_COLORS[e.elite], 0.35), x, y, flip, scale, feet);
    } else if (e.element !== "physical") {
      // Infused monsters wear their element, so you can tell what is about to hit you.
      drawSprite(ctx, tinted(name, ELEMENT_COLORS[e.element], 0.28), x, y, flip, scale, feet);
    } else {
      drawSprite(ctx, sprite(name), x, y, flip, scale, feet);
    }

    // The boss's own health lives on the frame at the top of the screen, and so does an
    // elite's now (`hud.ts` drawEliteBars) — a bar 44 pixels wide under a mini-boss reads
    // as a joke the same way.
    const barred = e.health < e.maxHealth;
    if (!e.boss && !e.elite && barred) {
      healthBar(ctx, x, y - e.radius * 2.6, e.health / e.maxHealth, 26);
    }
    if (e.sc.list.length > 0) {
      statusPips(ctx, e, x, y - e.radius * 2.6 - (!e.elite && barred ? 8 : 0));
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    for (const p of d.projectiles) {
      const { x, y } = lerpPos(p, alpha);
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      // A tapering tail behind it, then the bolt, then a white core. Three passes and
      // a bolt stops being a dot and starts being a thing travelling somewhere.
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = p.color;
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(x - p.vx * 0.012 * i, y - p.vy * 0.012 * i, p.radius * (1 - i * 0.22), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 0.42, 0, TAU);
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
 * A summoning-circle portal glyph: counter-rotating arcs, six turning runes, a lit
 * core. Shared by a dungeon's own exit and every portal station in the ship hub, so a
 * portal always reads as the same promise wherever it stands. `strength` is how active
 * it looks — a dungeon exit dims while the floor still needs clearing; a hub portal is
 * always at full strength, just in whichever colour its destination is known by.
 */
export function drawPortalGlyph(
  ctx: CanvasRenderingContext2D, x: number, y: number, time: number, color: string, strength = 1,
): void {
  const t = time;
  ctx.save();
  ctx.globalAlpha = strength;
  for (let i = 0; i < 3; i++) {
    const r = 20 + i * 7 + Math.sin(t * 2 + i) * 3;
    const spin = t * (0.7 + i * 0.3) * (i % 2 === 0 ? 1 : -1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, spin, spin + Math.PI * 1.35);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - t * 0.5;
    const r = 30;
    const s = 2.4 + Math.sin(t * 4 + i) * 0.8;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6);
    ctx.rotate(a);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  ctx.globalAlpha = 0.28 * strength;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 11, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.5 * strength;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(x, y, 6 + Math.sin(t * 3) * 1.5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Paints the whole floor of a level once into an offscreen canvas. It never changes
 * during a run, so there's no reason to redraw it every frame.
 *
 * Two ways it can go: if the biome names a tileset and that tileset has loaded, the
 * floor *and its walls* are stamped from real hand-arted stone by `paintTilemap`
 * (`tiled: true`, and the per-frame `drawWalls` is then skipped). Otherwise it falls
 * back to the flat bake — base colour, a scatter of darker tiles for texture, a border —
 * and `drawWalls` paints the wall boxes on top as before.
 */
function bakeFloor(
  level: Level, tilesetOverride?: string,
): { canvas: HTMLCanvasElement; tiled: boolean } {
  const { width, height, biome } = level;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // A run mode (the Abyssal Rift) can override the biome's own tileset; fall back
  // to the biome's if the override isn't loaded.
  const tilesetId = tilesetOverride ?? biome.tileset;
  const rawTs = tilesetId
    ? atlasTileset(tilesetId) ?? (biome.tileset ? atlasTileset(biome.tileset) : null)
    : null;
  if (rawTs && tilesetId) {
    // The sheet is never stamped as committed: it goes through the floor grade
    // first (flatten, desaturate, biome tint, contrast — `render/grade.ts`), which
    // is what keeps a dungeon floor in the same calm mid-grey register as the
    // Citadel deck instead of shouting under everything standing on it.
    const ts = gradedTileset(tilesetId, rawTs, biome.tint);
    // The biome's own floor tint behind the stamp, so any half-transparent tile
    // edge or unreachable gap reads as dim floor rather than a hole to the void —
    // a flat black ground made every room feel carved out of a solid block.
    ctx.fillStyle = biome.tint;
    ctx.fillRect(0, 0, width, height);
    if (paintTilemap(ctx, level, ts)) {
      // A faint inner vignette, just enough to settle the edges under low light
      // without closing the room in.
      const vg = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.45,
        width / 2, height / 2, Math.max(width, height) * 0.7,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
      return { canvas, tiled: true };
    }
  }

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
  return { canvas, tiled: false };
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

/**
 * What a drop looks like on the floor. Gear used to be one gem glyph tinted by rarity;
 * a dropped sword is now a sword, which is the difference between "loot appeared" and
 * "a sword appeared" from twenty feet away.
 */
/**
 * A dropped thing and the world scale to draw it at. A procedural icon rides the old
 * fixed `1.4` (or `1.0` for a weapon lying flat); a pipeline sprite carries its own
 * scale so a 69px atlas sword doesn't land three times its predecessor's size.
 */
function pickupSprite(p: Pickup): { canvas: HTMLCanvasElement; scale: number } {
  const named = (name: SpriteName): { canvas: HTMLCanvasElement; scale: number } => ({
    canvas: sprite(name), scale: spriteWorldScale(name) ?? 1.4,
  });
  switch (p.kind) {
    case "coin": return named("coin");
    case "key": return named("key");
    case "potion": return named("potion");
    case "gem": return named("gem");
    // No dedicated art for materials — a gem tinted by the element it's made of reads
    // clearly enough at a glance, and it keeps every planet from needing its own icon.
    case "material": return p.element
      ? { canvas: tinted("gem", ELEMENT_COLORS[p.element], 0.75), scale: spriteWorldScale("gem") ?? 1.4 }
      : named("gem");
    case "relic": {
      // Same rule as items below: one decision (`chooseRelicArt`), one executor, so the
      // relic on the floor is the picture in the Hero slot and on the banner.
      const def = p.relicId ? RELIC_BY_ID[p.relicId] : undefined;
      if (!def) return named("gem");
      const art = relicSprite(def);
      return { canvas: art.canvas, scale: art.worldScale };
    }
    case "item": {
      const item = p.item;
      if (!item) return named("capsule");
      // What an item looks like is decided in exactly one place (`itemSprite`), so the
      // thing lying on this floor is the same picture the stash card, the chest reel, the
      // loot banner and the paper-doll show — UAT §11's critical requirement. This used
      // to be a second copy of that resolution and it had already drifted: it washed a
      // non-weapon icon at 0.4 where the stash washed it at 0.5.
      const art = itemSprite(item);
      return { canvas: art.canvas, scale: art.worldScale };
    }
    default: return named("coin");
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


/**
 * A telegraph, drawn as the shape it will damage plus a sweep that fills as the
 * wind-up runs out. Read the shape, then read how long you have — that pair is the
 * entire skill of a boss fight, so both have to be unmistakable at a glance.
 */
function drawTelegraph(ctx: CanvasRenderingContext2D, t: Telegraph, time: number): void {
  const progress = clamp(1 - t.remaining / Math.max(0.001, t.total), 0, 1);
  // Ramps up as it approaches: a zone that is about to go off should be shouting.
  const urgency = 0.18 + progress * 0.3;

  ctx.save();
  ctx.strokeStyle = t.color;
  ctx.fillStyle = t.color;
  ctx.lineWidth = 2.5;

  switch (t.shape) {
    case "circle": {
      ctx.globalAlpha = urgency;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, TAU);
      ctx.fill();
      // The filling disc is the clock.
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius * progress, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, TAU);
      ctx.stroke();
      break;
    }
    case "donut": {
      // Everything outside the hole is lethal, so the hole is drawn as the safe thing:
      // green, outlined, and impossible to mistake for the danger.
      ctx.globalAlpha = urgency;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, TAU);
      ctx.arc(t.x, t.y, t.inner, 0, TAU, true);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.inner, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.inner + (t.radius - t.inner) * progress * 0.35, 0, TAU);
      ctx.stroke();
      break;
    }
    case "cone": {
      ctx.globalAlpha = urgency;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.arc(t.x, t.y, t.radius, t.angle - t.arc / 2, t.angle + t.arc / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.arc(t.x, t.y, t.radius * progress, t.angle - t.arc / 2, t.angle + t.arc / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.globalAlpha = urgency;
      ctx.fillRect(0, -t.width, t.radius, t.width * 2);
      ctx.globalAlpha = 0.34;
      ctx.fillRect(0, -t.width, t.radius * progress, t.width * 2);
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(0, -t.width, t.radius, t.width * 2);
      break;
    }
    case "none":
      break;
  }

  // A pulse on the outline in the last third, for anyone watching their own feet.
  if (progress > 0.66 && t.shape !== "none") {
    ctx.globalAlpha = 0.25 + Math.sin(time * 34) * 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/** Fire, rot or worse, left on the floor. Drawn as something you'd rather not step in. */
function drawGroundZone(ctx: CanvasRenderingContext2D, g: GroundZone, time: number): void {
  const fade = clamp(g.remaining, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.28 * fade;
  ctx.fillStyle = g.color;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, g.radius, g.radius * 0.72, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = g.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Licks of whatever it is, so a puddle doesn't read as a decal.
  ctx.globalAlpha = 0.4 * fade;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + time * 1.4;
    const r = g.radius * (0.3 + 0.4 * Math.abs(Math.sin(time * 3 + i)));
    ctx.beginPath();
    ctx.arc(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r * 0.7, 2.5 + Math.sin(time * 6 + i) * 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Little coloured squares over a monster for whatever is currently eating it. */
function statusPips(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number): void {
  const pips = e.sc.list.slice(0, 4);
  const size = 4;
  const gap = 2;
  const total = pips.length * (size + gap) - gap;
  ctx.save();
  pips.forEach((s, i) => {
    const spec = getStatusSpec(s.id);
    ctx.fillStyle = spec?.damageType ? ELEMENT_COLORS[spec.damageType as keyof typeof ELEMENT_COLORS] ?? "#e8eef7" : "#e8eef7";
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x - total / 2 + i * (size + gap), y - size - 2, size, size);
    // A stacked ailment gets a brighter cap, so five stacks of poison is visible.
    if (s.stacks > 1) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - total / 2 + i * (size + gap), y - size - 2, size, 1);
    }
  });
  ctx.restore();
}
