"""
The SUMMON_ELEMENT_WASH study (docket §36): what should the number be, and is a
full-body wash the right carrier at all?

Stands a cast of summons on the game's own graded floor (see `floor-export.ts`), at
true world scale, next to the hero and two monsters, and repeats the row once per
candidate treatment:

  wash 0.00        the authored art, no element at all (the control)
  wash 0.15/0.30/0.45   `tintedCanvas`'s exact arithmetic — source-atop fill at that
                   alpha, i.e. out = art*(1-s) + element*s on every opaque pixel.
                   0.30 is the placeholder shipped in `render/sprites.ts`.
  outline          the art untouched; only its outline pixels (opaque cells touching
                   transparency) blended 70% toward the element — an accent that says
                   "mine, and my element" without recolouring the body
  ground ring      the art untouched; a thin element-coloured ring on the floor under
                   the body — the windup ring `drawMinions` already draws, made permanent

One image per element (fire, cold, poison, void) so the loud and the pale elements are
both judged. This is a picture for the owner's eye, not a gate — it decided nothing by
itself; the owner ruled on it (outline accent, body wash zero, `SUMMON_ELEMENT_OUTLINE`
= 0.65). Kept so the next carrier question can be asked against the same rows.

  python3 art/summons/wash-study.py <floor-tile.png> <out-dir>
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ZOOM = 4                 # screen px per world unit
TILE_WORLD = 32          # a 16-texel sheet tile covers 32 world units (render/tilemap.ts)
ROW_WORLD_H = 66
GROUND_Y = 52

ELEMENT_COLORS = {"fire": "#ff7a2f", "cold": "#7dd3fc", "poison": "#84cc16", "void": "#c084fc"}

CAST = [  # (atlas id, folder)
    ("hero.legend-base", "characters"),
    ("summon.skeleton-warrior", "summons"), ("summon.grave-guard", "summons"),
    ("summon.reaped-wraith", "summons"), ("summon.kept-name", "summons"),
    ("summon.auto-turret", "summons"), ("summon.siege-engine", "summons"),
    ("summon.spirit-wolf", "summons"), ("summon.spirit-hawk", "summons"),
    ("summon.healing-spirit", "summons"), ("summon.healing-bloom", "summons"),
    ("reliquary.monster.rot-imp", "monsters"), ("reliquary.monster.cult-caster", "monsters"),
]
TINTED = {id for id, _ in CAST if id.startswith("summon.")}


def manifest_rows():
    src = (ROOT / "src/render/atlas/manifest.ts").read_text()
    rows = {}
    for m in re.finditer(r'"([\w.\-]+)":\s*\{\s*id:\s*"\1",\s*w:\s*(\d+),\s*h:\s*(\d+),\s*worldScale:\s*([\d.]+),\s*feet:\s*([\d.]+)', src):
        rows[m.group(1)] = (int(m.group(2)), int(m.group(3)), float(m.group(4)), float(m.group(5)))
    return rows


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def wash(img, color, s):
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (round(r * (1 - s) + color[0] * s), round(g * (1 - s) + color[1] * s),
                        round(b * (1 - s) + color[2] * s), a)
    return out


def outline_accent(img, color, s=0.7):
    out = img.copy()
    src = img.load()
    px = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h or src[nx, ny][3] == 0:
                    edge = True
                    break
            if edge:
                r, g, b, a = src[x, y]
                px[x, y] = (round(r * (1 - s) + color[0] * s), round(g * (1 - s) + color[1] * s),
                            round(b * (1 - s) + color[2] * s), a)
    return out


def scene(floor_tile, figures, world_w, treat, color):
    W, H = world_w * ZOOM, ROW_WORLD_H * ZOOM
    img = Image.new("RGBA", (W, H))
    texel = TILE_WORLD // floor_tile.width  # world units per texel (2)
    big = floor_tile.resize((floor_tile.width * texel * ZOOM, floor_tile.height * texel * ZOOM), Image.NEAREST)
    for ty in range(0, H, big.height):
        for tx in range(0, W, big.width):
            img.paste(big, (tx, ty))
    d = ImageDraw.Draw(img)
    for fid, art, ws, feet, x in figures:
        tinted = fid in TINTED
        aw, ah = art.width * ws, art.height * ws
        left, top = x - aw / 2, GROUND_Y + feet * ah - ah
        if tinted and treat == "ring":
            cy = GROUND_Y + (feet - 0.5) * ah if feet >= 0.4 else GROUND_Y
            rx, ry = max(6, aw * 0.55), max(3, aw * 0.28)
            d.ellipse([(x - rx) * ZOOM, (cy - ry) * ZOOM, (x + rx) * ZOOM, (cy + ry) * ZOOM],
                      outline=color + (200,), width=max(2, ZOOM // 2))
        a = art
        if tinted:
            if treat.startswith("wash"):
                a = wash(art, color, float(treat[4:]))
            elif treat == "outline":
                a = outline_accent(art, color)
        scaled = a.resize((max(1, round(aw * ZOOM)), max(1, round(ah * ZOOM))), Image.NEAREST)
        img.alpha_composite(scaled, (round(left * ZOOM), round(top * ZOOM)))
    return img


def main():
    floor_path, out_dir = sys.argv[1], Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = manifest_rows()
    floor = Image.open(floor_path).convert("RGBA")
    figures, x = [], 24
    for fid, folder in CAST:
        w, h, ws, feet = rows[fid]
        art = Image.open(ROOT / f"src/render/atlas/{folder}/{fid}.png").convert("RGBA")
        if art.size != (w, h):  # animated strips: frame 0
            art = art.crop((0, 0, w, h))
        figures.append((fid, art, ws, feet, x))
        x += 34 if fid.startswith("summon.") else 40
    world_w = x + 8
    treatments = [("wash0", "wash 0.00 — authored art, no element (control)"),
                  ("wash0.15", "wash 0.15"),
                  ("wash0.3", "wash 0.30 — the shipped placeholder"),
                  ("wash0.45", "wash 0.45"),
                  ("outline", "outline accent 70% — body untouched"),
                  ("ring", "ground ring — body untouched")]
    label_h = 18
    for el, hexc in ELEMENT_COLORS.items():
        color = hex_rgb(hexc)
        sheet = Image.new("RGBA", (world_w * ZOOM, len(treatments) * (ROW_WORLD_H * ZOOM + label_h)), (20, 18, 24, 255))
        d = ImageDraw.Draw(sheet)
        oy = 0
        for key, label in treatments:
            d.rectangle([0, oy, sheet.width, oy + label_h], fill=(20, 18, 24, 255))
            d.text((6, oy + 3), f"{el} {hexc}  ·  {label}", fill=(235, 230, 220, 255))
            sheet.alpha_composite(scene(floor, figures, world_w, key, color), (0, oy + label_h))
            oy += ROW_WORLD_H * ZOOM + label_h
        path = out_dir / f"wash-study-{el}.png"
        sheet.save(path)
        print(f"wrote {path} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
