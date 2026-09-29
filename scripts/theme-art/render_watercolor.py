"""Render Claude's existing PaperLoop collage artwork with a transparent canvas.
Adapted from the delivered demo/poster.py; preserves seeds, shapes and pigments.
Run from any directory: python scripts/theme-art/render_watercolor.py
"""
import sys, math, random
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, HALF = 1200, 1600, 800
FONTS = 'C:/Windows/Fonts/'
INKBLUE = (92, 116, 140)

def smooth_noise(h, w, scale, rng):
    """Low-frequency noise in [0,1]."""
    small = rng.random((max(2, h // scale + 2), max(2, w // scale + 2))).astype(np.float32)
    big = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
    return np.clip(big, 0, 1)

def paper(h, w, rng):
    base = np.empty((h, w, 3), np.float32); base[:] = (250, 247, 241)
    tone = (smooth_noise(h, w, 90, rng) - .5) * 5 + (smooth_noise(h, w, 12, rng) - .5) * 3
    grain = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(np.float32), (0, 0), .7) * 1.6
    base += (tone + grain)[..., None]
    # paper fibres: short, faint, mostly lighter strokes
    fib = np.zeros((h, w), np.float32)
    for _ in range(h * w // 2600):
        x, y = rng.integers(0, w), rng.integers(0, h); a = rng.random() * math.pi; L = rng.integers(6, 22)
        cv2.line(fib, (int(x), int(y)), (int(x + L * math.cos(a)), int(y + L * math.sin(a))), float(rng.choice([-1, 1]) * rng.uniform(2, 5)), 1, cv2.LINE_AA)
    base += cv2.GaussianBlur(fib, (0, 0), .6)[..., None]
    return np.clip(base, 0, 255)

def wash(top, rng, h, w, grid=(24, 16)):
    """Soft watercolor wash for the bottom half: the photo's colours, mirrored at the divider,
    heavily blurred and lightened, strongest near the line and fading down the page."""
    a = np.asarray(top).astype(np.float32)[::-1]              # mirror: colours continue across the divider
    small = cv2.resize(a, grid, interpolation=cv2.INTER_AREA)       # coarse: colours only, never a ghost of the subject
    big = cv2.GaussianBlur(cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC), (0, 0), 60)
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    strength = (.5 * (1 - t) ** 1.3 + .16) * (.78 + .44 * smooth_noise(h, w, 140, rng))   # blotchy, like a real wash
    return 1 - (strength[..., None] * (1 - big / 255))

def cover(img, w, h, fx, fy):
    """Crop to w:h around focus (fx, fy) and resize."""
    iw, ih = img.size; r = w / h
    cw, ch = (iw, iw / r) if iw / ih < r else (ih * r, ih)
    x0 = min(max(0, fx * iw - cw / 2), iw - cw); y0 = min(max(0, fy * ih - ch / 2), ih - ch)
    return img.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((w, h), Image.LANCZOS)

def subject_mask(rgb, rect, kind, bg=None, poly=None):
    """Float mask in [0,1] of the subject inside the collage crop."""
    h, w = rgb.shape[:2]
    if poly is not None:
        pts = np.array([[x * w, y * h] for x, y in poly], np.int32)
        m = np.zeros((h, w), np.uint8); cv2.fillPoly(m, [pts], 1)
        k = max(3, w // 40)
        gc = np.full((h, w), cv2.GC_BGD, np.uint8)
        gc[cv2.dilate(m, np.ones((k, k), np.uint8)) > 0] = cv2.GC_PR_BGD
        gc[m > 0] = cv2.GC_PR_FGD
        gc[cv2.erode(m, np.ones((k * 2, k * 2), np.uint8)) > 0] = cv2.GC_FGD
        bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
        m = np.where((gc == 1) | (gc == 3), 1, 0).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)
    if kind == 'landscape':
        return np.ones((h, w), np.float32)
    if kind == 'flat':  # illustration on a plain paper background
        d = np.abs(rgb.astype(np.int16) - np.array(bg, np.int16)).sum(2)
        m = (d > 90).astype(np.uint8)   # soft ground shadows (about 70) do not count as outline
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        # anything enclosed by the ink outline is subject, even white fur the colour of the paper
        reach = (1 - m).copy(); ff = np.zeros((h + 2, w + 2), np.uint8)
        border = [(x, 0) for x in range(0, w, 4)] + [(x, h - 1) for x in range(0, w, 4)] + [(0, y) for y in range(0, h, 4)] + [(w - 1, y) for y in range(0, h, 4)]
        for sx, sy in border:   # seed from every edge, so gaps open to any side stay background
            if reach[sy, sx] == 1: cv2.floodFill(reach, ff, (sx, sy), 2)
        m = (reach != 2).astype(np.uint8)
        return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2)
    x0, y0, x1, y1 = rect
    r = (int(x0 * w), int(y0 * h), int((x1 - x0) * w), int((y1 - y0) * h))
    mask = np.zeros((h, w), np.uint8); bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, r, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == 1) | (mask == 3), 1, 0).astype(np.uint8)
    # keep the largest connected piece so stray background blobs do not become squares
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]); m = (lab == keep).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)

def brighten(c):
    c = 255 - (255 - c) * .97                      # only a touch of paper lift: keep the photo's depth
    g = c.mean(-1, keepdims=True); chroma = np.abs(c - g).max(-1, keepdims=True)
    boost = np.where(chroma > 18, 1.14, 1.0)                 # vivid hues stay vivid; greys stay neutral
    c = g + (c - g) * boost
    return np.clip(c, 0, 255)

def piece(size, rng):
    """Alpha mask for one paper square with soft, slightly irregular corners."""
    pad = 3; n = size + 2 * pad
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    inside = np.minimum.reduce([xx - pad, yy - pad, (n - 1 - pad) - xx, (n - 1 - pad) - yy])
    wob = (smooth_noise(n, n, 6, rng) - .5) * 1.6
    # round the corners a little, each by a different amount
    lo, hi = pad, n - 1 - pad
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        rad = rng.uniform(1.5, 3.5)
        cx = (lo if sx > 0 else hi) + sx * rad; cy = (lo if sy > 0 else hi) + sy * rad   # arc centre, inside the square
        corner = ((xx - cx) * sx < 0) & ((yy - cy) * sy < 0)                            # only the outer corner quadrant
        inside = np.where(corner, np.minimum(inside, rad - np.hypot(xx - cx, yy - cy)), inside)
    return np.clip(inside + wob + .5, 0, 1), pad

def collage(canvas, rgb, mask, box, cols, rng, kind, bg=None, env=False, coverage=None):
    """Rebuild rgb (the collage crop) as watercolor squares inside box=(x0,y0,x1,y1) of canvas."""
    h, w = rgb.shape[:2]; rows = max(1, round(cols * h / w))
    bx0, by0, bx1, by1 = box
    pitch = min((bx1 - bx0) / cols, (by1 - by0) / rows)
    ox = bx0 + ((bx1 - bx0) - pitch * cols) / 2; oy = by0 + ((by1 - by0) - pitch * rows) / 2
    colors = cv2.resize(rgb.astype(np.float32), (cols, rows), interpolation=cv2.INTER_AREA)
    # restore the contrast lost by averaging each cell: an S-curve on lightness, hue kept
    lum0 = colors.mean(-1, keepdims=True) / 255
    curved = 1 / (1 + np.exp(-(lum0 - .5) * 4)); curved = (curved - curved.min()) / max(1e-6, curved.max() - curved.min())
    colors = np.clip(colors + (curved - lum0) * 255 * .35, 0, 255)   # gentle, same shift on every channel: no cast
    # a finer colour map, so each square carries the light and shade of its spot in the photo
    SUB = 6
    fine = cv2.resize(rgb.astype(np.float32), (cols * SUB, rows * SUB), interpolation=cv2.INTER_AREA)
    fl = fine.mean(-1, keepdims=True) / 255; fc = 1 / (1 + np.exp(-(fl - .5) * 4)); fc = (fc - fc.min()) / max(1e-6, fc.max() - fc.min())
    fine = np.clip(fine + (fc - fl) * 255 * .35, 0, 255)
    m = cv2.resize(mask, (cols, rows), interpolation=cv2.INTER_AREA)
    halo = cv2.GaussianBlur(m, (0, 0), 1.6)
    if kind == 'landscape':
        # organic outline: a squarish ellipse broken up by low-frequency noise, never a rectangle
        yy, xx = np.mgrid[0:rows, 0:cols].astype(np.float32)
        rr = (np.abs((xx - (cols - 1) / 2) / (cols / 2)) ** 3 + np.abs((yy - (rows - 1) / 2) / (rows / 2)) ** 3) ** (1 / 3)
        m = np.clip((1 - rr ** 3) * 1.7 + (smooth_noise(rows, cols, 5, rng) - .5) * 1.3, 0, 1)
        halo = cv2.GaussianBlur(m, (0, 0), 1.4)
    if env:
        yy, xx = np.mgrid[0:rows, 0:cols].astype(np.float32)
        rr = (np.abs((xx - (cols - 1) / 2) / (cols * .44)) ** 3 + np.abs((yy - (rows - 1) / 2) / (rows * .45)) ** 3) ** (1 / 3)
        em = np.clip((1 - rr ** 3) * 1.5 + (smooth_noise(rows, cols, 5, rng) - .5) * 1.3, 0, 1)
        eh = cv2.GaussianBlur(em, (0, 0), 1.4)
    lum = colors.mean(-1) / 255
    for r in range(rows):
        for c in range(cols):
            v, hv = m[r, c], halo[r, c]
            # dense core, broken edge, a few strays that follow nearby colors and grid positions
            if v > .72: p = .985
            elif v > .25: p = .25 + .9 * (v - .25)
            else: p = hv * .45 if hv > .06 else 0
            if env:
                e = em[r, c]
                pe = .95 if e > .72 else (.2 + .9 * (e - .25) if e > .25 else (eh[r, c] * .4 if eh[r, c] > .06 else 0))
                p = max(p, pe)
            if kind == 'landscape' and lum[r, c] > .78 and r < rows * .55: p *= .9   # a little sparser in the brightest sky
            if bg is not None and v < .9 and np.abs(colors[r, c] - bg).sum() < 60: p = 0   # edge/stray squares never paint plain paper
            if rng.random() > p: continue
            size = int(round(pitch * rng.uniform(.84, .9)))
            if rng.random() < .12: size += rng.choice([-1, 1])
            alpha, pad = piece(size, rng)
            n = alpha.shape[0]
            x = int(round(ox + c * pitch + (pitch - size) / 2 + rng.uniform(-.8, .8))) - pad
            y = int(round(oy + r * pitch + (pitch - size) / 2 + rng.uniform(-.8, .8))) - pad
            if x < 0 or y < 0 or x + n >= canvas.shape[1] or y + n >= canvas.shape[0]: continue
            jit = rng.uniform(.96, 1.04)
            col = np.clip(brighten(colors[r, c]) * jit, 0, 255) / 255
            L = float(col.mean())
            block = fine[r * SUB:(r + 1) * SUB, c * SUB:(c + 1) * SUB]
            field = cv2.resize(block, (n, n), interpolation=cv2.INTER_CUBIC)
            field = np.clip(brighten(field) * jit, 0, 255) / 255
            colf = .55 * field + .45 * col[None, None, :]              # light and shade inside the piece
            # pigment density: wash variation, pooled rims, granulation in dark pieces, faint folds
            dens = .9 + .18 * smooth_noise(n, n, max(3, n // 3), rng)
            inner = cv2.distanceTransform((alpha > .5).astype(np.uint8), cv2.DIST_L2, 3)
            dens += .2 * np.exp(-inner / 1.6)                       # pigment pools at the rim
            grains = cv2.GaussianBlur(rng.random((n, n)).astype(np.float32), (0, 0), .45)
            dens += (1 - L) * .45 * np.clip(grains - .42, -.08, .5)  # granulation: dark pigment grains, no white specks
            if rng.random() < .28:                                   # a soft bloom with a darker edge
                by, bx = rng.uniform(.3, .7) * n, rng.uniform(.3, .7) * n; yy, xx = np.mgrid[0:n, 0:n]
                d = np.hypot(xx - bx, yy - by) / (n * rng.uniform(.18, .3))
                dens *= 1 - .3 * np.exp(-d ** 2) + .12 * np.exp(-(d - 1.1) ** 2 / .08)
            if L > .86: dens *= .85                     # highlights let the paper show through
            if rng.random() < .35:                     # crumple: a soft light crease
                a = rng.uniform(0, math.pi); yy, xx = np.mgrid[0:n, 0:n]
                d = np.abs((xx - n / 2) * math.sin(a) - (yy - n / 2) * math.cos(a) + rng.uniform(-n / 4, n / 4))
                dens *= 1 - .18 * np.exp(-d / .9)
            dens = np.clip(dens, 0, 1.15)
            region = canvas[y:y + n, x:x + n]
            # very subtle edge shadow, offset down-right
            sh = cv2.GaussianBlur(alpha, (0, 0), .9); sh = np.roll(np.roll(sh, 1, 0), 1, 1)
            region *= (1 - .07 * sh)[..., None]
            absorb = (dens * alpha)[..., None] * (1 - colf)
            region *= np.clip(1 - absorb, 0, 1)
            if coverage is not None:
                dest = coverage[y:y + n, x:x + n]
                dest[:] = 1 - (1 - dest) * (1 - alpha) * (1 - .07 * sh)

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent.parent / 'browser-extension/images/paperloop-themes/watercolor'
JOBS = {
 'cowcat': ('cow', (.24, 0, 1, 1), 'flat'),
 'shiba': ('shiba', (.38, .04, 1, 1), 'flat'),
 'iris': ('iris', (.1, .04, .98, 1), 'flat'),
 'paper': ('paper', (.3, .12, 1, 1), 'flat'),
 'sage': ('sage', (.2, .1, 1, .95), 'flat'),
 'ink': ('ink', (.25, 0, 1, 1), 'landscape'),
 'tide': ('tide', (0, 0, 1, 1), 'landscape'),
}

def render(name, source, crop, kind):
    rng = np.random.default_rng(3)
    img = Image.open(ROOT / 'source' / (source + '.png')).convert('RGB')
    iw, ih = img.size
    part = img.crop(tuple(int(v * (iw if i % 2 == 0 else ih)) for i, v in enumerate(crop)))
    part.thumbnail((900, 900), Image.LANCZOS)
    rgb = np.asarray(part)
    bg = (251, 250, 247)
    mask = subject_mask(rgb, None, kind, bg)
    canvas = np.full((400, 660, 3), 255, np.float32)
    coverage = np.zeros((400, 660), np.float32)
    collage(canvas, rgb, mask, (10, 10, 650, 394),
            34 if kind != 'landscape' else 40, rng, kind,
            np.array(bg, np.float32) if kind == 'flat' else None,
            coverage=coverage)
    # Coverage comes from paper-piece geometry, not pixel brightness:
    # white fur, pale petals and paper highlights remain intact.
    coverage = np.maximum(coverage, 1 - canvas.min(axis=2) / 255)
    alpha = np.round(np.clip(coverage, 0, 1) * 255).astype(np.uint8)
    a = alpha.astype(np.float32)[..., None] / 255
    color = np.where(a > 0, (canvas - 255 * (1 - a)) / np.maximum(a, 1 / 255), 0)
    rgba = np.dstack((np.round(np.clip(color, 0, 255)).astype(np.uint8), alpha))
    # White recomposition must preserve the existing artwork, including soft edges.
    restored = rgba[..., :3].astype(float) * a + 255 * (1 - a)
    assert np.abs(restored - canvas).max() < 1.6, name
    assert alpha[0, 0] == 0 and np.mean(alpha == 0) > .15, name
    Image.fromarray(rgba, 'RGBA').save(OUTPUT / (name + '.png'))
    print(name, 'transparent pixels:', round(float(np.mean(alpha == 0)) * 100, 1), '%')

if __name__ == '__main__':
    for name, args in JOBS.items():
        render(name, *args)
