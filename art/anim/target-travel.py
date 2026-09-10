"""`python3 art/anim/target-travel.py` — is a wind-up's problem its TARGET or its PATH?

Run before spending generation budget on a wind-up. It splits the question cleanly: a timid
target means no amount of path control helps and the answer is authoring a more committed
apex; a committed target means the generator's path is what to go after.

NOTE: the owner reviewed and APPROVED the three shipped wind-ups on 2026-09-10 ("the wind
ups look really good"). Nothing below is a defect list — it is a pacing diagnostic for NEW
art. See docs/animation.md, "What 'halfway done' actually meant".

Measured 2026-09-10 the answer was PATH — all three shipped targets clear the amplitude bar
(43.0%, 32.7%, 30.7% against 25%) and all three strips reach that amplitude, while the motion
along the way front-loads and coasts. The second half of the output is why: in four of five
pinned runs the generator lands within 0-3.5% of target at frame 6 of 8, retreats, and the
last frame is our own pinned file. See docs/animation.md, "The targets are not timid".


Uses windup-check.py's exact metric (silhouette at alpha>128, differing pixels / frame-0
opaque area) so the numbers are directly comparable to its MOVES_AT_LEAST = 0.25 bar.
"""
import os
from PIL import Image

RAW = "art/anim/raw"
STRIP = "src/render/atlas/bosses"

def sil(im):
    return [p[3] > 128 for p in im.convert("RGBA").getdata()]

def diff(a, b, area):
    return sum(1 for x, y in zip(a, b) if x != y) / area

def strip_frames(name, w, h, cols):
    im = Image.open(f"{STRIP}/{name}.png").convert("RGBA")
    assert im.size == (w * cols, h), f"{name} is {im.size}, expected {(w*cols, h)}"
    return [im.crop((c * w, 0, (c + 1) * w, h)) for c in range(cols)]

# id, target file, idle-committed dir, strip name, w, h, cols, cast from..to
BOSSES = [
    ("ferryman",  "ferryman-target-lit.png", "ferryman-idle-committed",  "boss.ferryman",  75, 107, 13, 5, 12),
    ("war-queen", "war-queen-target.png",    "war-queen-idle-committed", "boss.war-queen", 98, 108, 13, 5, 12),
    ("tyrant",    "tyrant-target.png",       "tyrant-idle-committed",    "boss.exiled-tyrant", 98, 103, 14, 5, 13),
]

print("\n=== TIMIDITY: how far does the pinned TARGET travel from rest? ===")
print("    (windup-check.py's own metric; its bar for 'not a fidget' is 25%)\n")
for bid, tgt, idle_dir, strip, w, h, cols, cfrom, cto in BOSSES:
    target = Image.open(f"{RAW}/{tgt}")
    idle0 = Image.open(f"{RAW}/{idle_dir}/f0.png")
    frames = strip_frames(strip, w, h, cols)
    cast = frames[cfrom:cto + 1]

    ts, i0s = sil(target), sil(idle0)
    area_idle = sum(i0s) or 1
    cast0s = sil(cast[0])
    area_cast0 = sum(cast0s) or 1
    lasts = sil(cast[-1])

    print(f"  {bid}  (target {target.size}, idle f0 {idle0.size}, cast frames {len(cast)})")
    if target.size == idle0.size:
        print(f"    target vs committed idle f0      {100*diff(ts, i0s, area_idle):5.1f}%")
    if target.size == cast[0].size:
        print(f"    target vs wind-up's FIRST frame  {100*diff(ts, cast0s, area_cast0):5.1f}%")
        print(f"    target vs wind-up's LAST frame   {100*diff(ts, lasts, area_cast0):5.1f}%   <- 0 means the strip really did land on it")
    # The shipped curve, in the same metric, for comparison with the 25% bar.
    curve = [100 * diff(sil(f), cast0s, area_cast0) for f in cast]
    print(f"    shipped wind-up vs its frame 0   " + " ".join(f"{v:.0f}%" for v in curve))
    print(f"    peak {max(curve):.0f}% at frame {cfrom + curve.index(max(curve))}, ends {curve[-1]:.0f}%")
    print()

print("=== LOITER-THEN-SNAP: where does a pinned run spend its budget? ===")
print("    distance to target per frame, then the per-frame closing steps\n")
for d in sorted(os.listdir(RAW)):
    p = os.path.join(RAW, d)
    if not os.path.isdir(p) or "windup" not in d:
        continue
    base = d.split("-windup")[0]
    cand = [f"{base}-target.png", "ferryman-target-lit.png" if base == "ferryman" else None]
    tgt = next((c for c in cand if c and os.path.exists(os.path.join(RAW, c))), None)
    if not tgt:
        print(f"  {d}: no target file, skipped"); continue
    fs = sorted(f for f in os.listdir(p) if f.endswith(".png"))
    ims = [Image.open(os.path.join(p, f)) for f in fs]
    t = Image.open(os.path.join(RAW, tgt))
    if ims[0].size != t.size:
        print(f"  {d}: target {t.size} vs frames {ims[0].size}, skipped"); continue
    ts = sil(t)
    area = sum(sil(ims[0])) or 1
    dist = [100 * diff(sil(im), ts, area) for im in ims]
    steps = [dist[i] - dist[i + 1] for i in range(len(dist) - 1)]
    total = dist[0] - dist[-1]
    print(f"  {d} ({len(fs)} frames, target {tgt})")
    print(f"    to target : " + " ".join(f"{v:.1f}" for v in dist))
    print(f"    closed    : " + " ".join(f"{v:+.1f}" for v in steps))
    if total > 0:
        print(f"    final step closes {100*steps[-1]/total:.0f}% of all distance closed; "
              f"largest single step is {100*max(steps)/total:.0f}% at step {steps.index(max(steps))+1}")
    print()
