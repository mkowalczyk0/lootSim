from PIL import Image
import os

STAGE_W, STAGE_H = 56, 68
HERO_DX, HERO_DY = 14, 20

MARKS = {
    (255, 0, 255): 0,
    (0, 255, 0): 1,
    (0, 255, 255): 2,
}


def recolor(im, colors):
    im = im.convert("RGBA")
    px = im.load()
    rgbs = []
    for c in colors:
        c = c.lstrip("#")
        rgbs.append(tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)))
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            idx = MARKS.get((r, g, b))
            if idx is not None:
                nr, ng, nb = rgbs[idx]
                px[x, y] = (nr, ng, nb, a)
    return im


hero = Image.open("src/render/atlas/characters/hero.legend-base.png").convert("RGBA")

layers = {
    "hatWitch": ("src/render/atlas/cosmetics/cosmetic.hat-witch.png", ["#4c1d95", "#312e81", "#fbbf24"], 10, 2, "hat"),
    "hatCrown": ("src/render/atlas/cosmetics/cosmetic.hat-crown.png", ["#fbbf24", "#f59e0b", "#ef4444"], 14, 8, "hat"),
    "earsCat": ("src/render/atlas/cosmetics/cosmetic.ears-cat.png", ["#1f2937", "#f9a8d4", "#f9a8d4"], 18, 18, "ears"),
    "earsHorn": ("src/render/atlas/cosmetics/cosmetic.ears-horn.png", ["#dc2626", "#7f1d1d", "#fca5a5"], 16, 12, "ears"),
    "faceGlasses": ("src/render/atlas/cosmetics/cosmetic.face-glasses.png", ["#67e8f9", "#1f2937", "#ffffff"], 15, 25, "face"),
    "faceVisor": ("src/render/atlas/cosmetics/cosmetic.face-visor.png", ["#22d3ee", "#0e7490", "#ffffff"], 14, 24, "face"),
    "backCape": ("src/render/atlas/cosmetics/cosmetic.back-cape.png", ["#dc2626", "#7f1d1d", "#7f1d1d"], 13, 30, "back"),
    "backAngel": ("src/render/atlas/cosmetics/cosmetic.back-wings-angel.png", ["#f8fafc", "#e0f2fe", "#ffffff"], 3, 32, "back"),
}


def compose(active):
    canvas = Image.new("RGBA", (STAGE_W, STAGE_H), (0, 0, 0, 0))
    for name in active:
        path, colors, dx, dy, slot = layers[name]
        if slot != "back":
            continue
        img = recolor(Image.open(path), colors)
        canvas.alpha_composite(img, (dx, dy))
    canvas.alpha_composite(hero, (HERO_DX, HERO_DY))
    for slot in ("face", "ears", "hat"):
        for name in active:
            path, colors, dx, dy, s = layers[name]
            if s != slot:
                continue
            img = recolor(Image.open(path), colors)
            canvas.alpha_composite(img, (dx, dy))
    return canvas


combos = {
    "hatWitch_only": ["hatWitch"],
    "hatCrown_only": ["hatCrown"],
    "earsCat_only": ["earsCat"],
    "earsHorn_only": ["earsHorn"],
    "faceGlasses_only": ["faceGlasses"],
    "faceVisor_only": ["faceVisor"],
    "backCape_only": ["backCape"],
    "backAngel_only": ["backAngel"],
    "witch_and_cape": ["backCape", "hatWitch"],
    "crown_wings_visor": ["backAngel", "faceVisor", "hatCrown"],
}

os.makedirs("art/cosmetics/preview", exist_ok=True)
for name, active in combos.items():
    out = compose(active)
    out2 = out.resize((out.width * 6, out.height * 6), Image.NEAREST)
    out2.save(f"art/cosmetics/preview/{name}.png")
print("done")
