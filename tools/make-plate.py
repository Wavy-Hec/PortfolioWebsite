#!/usr/bin/env python3
"""Draw img/proj-humanoid-ink.png and its -2x twin: a Unitree G1 walking, in dry brush ink.

    pip install numpy pillow
    python tools/make-plate.py

Proportions and joint positions come from the G1 model in MuJoCo Menagerie, posed mid-stride
and seen from the side.
"""
import pathlib

import numpy as np
from PIL import Image

IMG = pathlib.Path(__file__).resolve().parent.parent / "img"
W, H = 1280, 720
STEP = 0.5
PAPER = (233, 231, 226)
INK = (17, 17, 20)
SEED = 11


def even(a):
    """rank the values onto an even spread from 0 to 1"""
    out = np.empty(a.size, np.float32)
    out[np.argsort(a, axis=None, kind="stable")] = np.linspace(0, 1, a.size, dtype=np.float32)
    return out.reshape(a.shape)


def wander(rng, rows, n, cell):
    """rows of smooth noise, n samples long, with features about `cell` samples apart"""
    knots = rng.random((rows, int(n / cell) + 3)).astype(np.float32)
    x = np.arange(n) / cell
    i = x.astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    return knots[:, i] * (1 - f) + knots[:, i + 1] * f


def blotches(rng, cell):
    coarse = rng.random((int(H / cell) + 3, int(W / cell) + 3)).astype(np.float32)
    size = (int(coarse.shape[1] * cell), int(coarse.shape[0] * cell))
    return np.asarray(Image.fromarray(coarse).resize(size, Image.BICUBIC))[:H, :W]


def through(points):
    """a Catmull-Rom curve through the points, about a pixel per sample"""
    p = np.asarray(points, float)
    if len(p) == 2:
        n = max(2, int(np.hypot(*(p[1] - p[0]))))
        return p[0] + (p[1] - p[0]) * np.linspace(0, 1, n)[:, None]
    q = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(1, len(q) - 2):
        p0, p1, p2, p3 = q[i - 1 : i + 3]
        n = max(2, int(np.hypot(*(p2 - p1))))
        t = np.linspace(0, 1, n, endpoint=False)[:, None]
        out.append(
            0.5
            * (
                2 * p1
                + (p2 - p0) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t**2
                + (3 * p1 - p0 - 3 * p2 + p3) * t**3
            )
        )
    out.append(p[-1:])
    return np.vstack(out)


def ease(values, t):
    """a profile given at even steps from 0 to 1, read smoothly at t"""
    v = np.asarray(values, float)
    x = t * (len(v) - 1)
    i = np.minimum(x.astype(int), len(v) - 2)
    f = x - i
    f = f * f * (3 - 2 * f)
    return v[i] * (1 - f) + v[i + 1] * f


class Sheet:
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)
        self.ink = np.zeros((H, W), bool)
        self.grain = even(0.5 * self.rng.random((H, W)) + 0.5 * blotches(self.rng, 3.0))

    def mark(self, x, y, hit, lift):
        xi = np.rint(x[hit]).astype(np.intp)
        yi = np.rint(y[hit]).astype(np.intp)
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        self.ink[yi[ok], xi[ok]] = not lift

    def grain_at(self, x, y):
        return self.grain[
            np.clip(np.rint(y).astype(np.intp), 0, H - 1),
            np.clip(np.rint(x).astype(np.intp), 0, W - 1),
        ]

    def stroke(
        self, points, half, load=(1.0, 0.7), lift=False, bias=0.0, feather=0.3, bite=0.8, attack=2.0
    ):
        """drag a dry brush along the points: `half` is its half-width and `load` the ink left
        in it, from start to end; `bias` dries one side (positive: left of the direction of travel)
        """
        path = through(points)
        along = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(path, axis=0).T))])
        u = np.arange(0, along[-1], STEP)
        n = len(u)
        cx = np.interp(u, along, path[:, 0])
        cy = np.interp(u, along, path[:, 1])
        tx, ty = np.gradient(cx), np.gradient(cy)
        norm = np.hypot(tx, ty)
        nx, ny = -ty / norm, tx / norm
        width = ease(half, u / along[-1])
        wet = ease(load, u / along[-1])
        rng = self.rng

        edges = []
        for _ in range(2):
            sway = wander(rng, 1, n, 60 / STEP)[0] - 0.5
            nick = wander(rng, 1, n, 3 / STEP)[0] - 0.5
            edges.append(np.maximum(width * (1 + 0.12 * sway) + 2 * bite * nick, 0.3))
        reach = width.max() * 1.06 + bite + 1
        v = np.arange(-reach, reach + STEP, STEP)[:, None]
        s = v / np.where(v < 0, edges[0], edges[1])

        # each bristle runs dry on its own: some all along, some in streaks, some in short skips
        bristles = max(4, int(2 * reach / 2.4) + 1)
        dryness = 0.6 * rng.random((bristles, 1)).astype(np.float32)
        for cell, weight in ((50, 0.8), (14, 0.8), (4, 0.4)):
            dryness = dryness + weight * wander(rng, bristles, n, cell / STEP)
        dryness = even(dryness)
        row = np.clip((s + 1) / 2, 0, 1) * (bristles - 1)
        r0 = np.minimum(row.astype(int), bristles - 2)
        f = row - r0
        col = np.broadcast_to(np.arange(n), r0.shape)
        dry = dryness[r0, col] * (1 - f) + dryness[r0 + 1, col] * f

        x = cx + v * nx
        y = cy + v * ny
        dry = dry + 0.2 * (self.grain_at(x, y) - 0.5)
        lead = wander(rng, 1, n, 4 / STEP)[0]
        cover = wet * np.clip((1 - np.abs(s)) / feather, 0, 1)
        cover = cover * (1 - abs(bias) * np.clip((1 + np.sign(bias) * s) / 2, 0, 1))
        cover = cover * np.clip((u - attack * lead) / max(attack, 0.5) + 0.5, 0, 1)
        self.mark(x, y, dry > 1 - cover, lift)

    def blot(self, cx, cy, r, lift=False, rough=0.06, tooth=0.25, squash=1.0, angle=0.0):
        pad = r * 1.4 + 3
        ys, xs = np.mgrid[
            int(cy - pad) : int(cy + pad) + 1, int(cx - pad) : int(cx + pad) + 1
        ].astype(float)
        dx, dy = xs - cx, ys - cy
        ex = dx * np.cos(angle) + dy * np.sin(angle)
        ey = (dy * np.cos(angle) - dx * np.sin(angle)) / squash
        k = max(6, int(2 * np.pi * r / 7))
        rim = self.rng.random(k + 1)
        rim[-1] = rim[0]
        wobble = (
            np.interp((np.arctan2(ey, ex) + np.pi) / (2 * np.pi) * k, np.arange(k + 1), rim) - 0.5
        )
        edge = r * (1 + 2 * rough * wobble) + 4 * tooth * (self.grain_at(xs, ys) - 0.5)
        self.mark(xs, ys, np.hypot(ex, ey) < edge, lift)

    def spatter(self, cx, cy, spread, count):
        for _ in range(count):
            a = self.rng.random() * 2 * np.pi
            d = spread * self.rng.random() ** 0.8
            r = 1.0 + 2.5 * self.rng.random() ** 2.5
            self.blot(cx + np.cos(a) * d, cy + 0.6 * np.sin(a) * d, r, rough=0.2, tooth=0.15)


def joint(sheet, x, y, r, glint=0.0, pivot=0.0, ring=0.0):
    """an ink disc; optionally a lifted rim on its leading side, a crescent of light and a pivot"""
    sheet.blot(x, y, r)
    if ring:
        a = np.linspace(1.1, 3.4, 14)
        rim = np.c_[x + (r + ring) * np.cos(a), y - (r + ring) * np.sin(a)]
        sheet.stroke(rim, [0.4, ring, ring, 0.4], load=(1.2, 1.2), lift=True, feather=0.2, bite=0.3)
    if glint:
        a = np.linspace(1.55, 3.15, 12)
        arc = np.c_[x + 0.64 * r * np.cos(a), y - 0.64 * r * np.sin(a)]
        sheet.stroke(
            arc,
            [0.5, glint, 1.2 * glint, glint, 0.5],
            load=(1.3, 1.3),
            lift=True,
            feather=0.2,
            bite=0.4,
        )
    if pivot:
        sheet.blot(x, y, pivot, lift=True, rough=0.1, tooth=0.1)


def hand(sheet, wrist, tip, size, load=1.0):
    """a mitten: a blot at the wrist and one stroke for the fingers"""
    (wx, wy), (tx, ty) = wrist, tip
    d = np.hypot(tx - wx, ty - wy)
    ux, uy = (tx - wx) / d, (ty - wy) / d
    sheet.blot(
        wx + 0.9 * size * ux, wy + 0.9 * size * uy, size, squash=0.75, angle=np.arctan2(uy, ux)
    )
    bx, by = wx + size * ux, wy + size * uy
    bend = ((bx + tx) / 2 - 3.3 * uy, (by + ty) / 2 + 3.3 * ux)
    sheet.stroke(
        [(bx, by), bend, (tx, ty)],
        [0.7 * size, 0.75 * size, 0.7 * size, 0.55 * size],
        load=(load, 0.9 * load),
    )


def draw(sheet):
    # ground: lands just ahead of the planted foot and runs off the edge
    sheet.blot(352, 628, 13, squash=0.62)
    sheet.stroke(
        [(344, 628), (600, 636), (848, 647), (1048, 658), (1300, 670)],
        [8.5, 12.8, 13.8, 13.8, 12.8, 11.7, 10.6, 9.5, 8.5],
        load=(1, 0.9, 0.84, 0.8, 0.74, 0.66, 0.55),
        bias=0.35,
        feather=0.2,
    )

    # far arm, swung back behind the torso
    sheet.stroke(
        [(633, 199), (647, 222), (665, 242)], [15.5, 15.5, 14.2, 12.9], load=(0.8, 0.8), bias=-0.15
    )
    joint(sheet, 665, 243, 14.5, pivot=2.4)
    sheet.stroke(
        [(668, 251), (686, 280), (703, 306)], [12.9, 12.9, 11.6, 9], load=(0.8, 0.68), bias=-0.25
    )
    hand(sheet, (704, 308), (723, 367), 12.6, load=0.8)

    # far leg, planted
    sheet.stroke(
        [(624, 353), (602, 413), (582, 463)],
        [20.6, 21.9, 20.6, 18, 14.2],
        load=(1.05, 0.95, 0.82, 0.7),
        bias=0.25,
    )
    sheet.stroke(
        [(589, 378), (580, 422), (573, 459)], [5, 8.5, 9, 7, 2.6], load=(0.8, 0.7, 0.6), bias=0.3
    )
    joint(sheet, 578, 475, 18.4, pivot=3)
    sheet.stroke(
        [(577, 484), (576, 543), (582, 596)],
        [15.5, 15.5, 14.2, 11.6, 9],
        load=(1, 0.86, 0.7),
        bias=0.25,
    )
    joint(sheet, 582, 601, 12, pivot=2.5)
    sheet.stroke(
        [(618, 614), (520, 617)], [14.2, 14.2, 12.9, 9, 3.9], load=(1.1, 1, 0.9), feather=0.2
    )

    # torso, waist and hips
    sheet.stroke(
        [(606, 155), (613, 221), (625, 280)],
        [40, 42.5, 41.5, 39, 36.5],
        load=(1.2, 1.12, 1.04, 0.95, 0.84),
        bias=-0.25,
        feather=0.12,
        attack=1,
    )
    sheet.stroke([(628, 277), (632, 309)], [14.2, 12.9, 14.2], load=(1, 0.95), feather=0.2)
    sheet.stroke(
        [(632, 307), (636, 355)], [30.9, 32.2, 30.9], load=(1.15, 1.05), feather=0.12, attack=1
    )
    joint(sheet, 636, 341, 31, glint=6.5, pivot=4, ring=2)

    # head: a helmet with the visor lifted out of it
    sheet.stroke([(607, 131), (612, 159)], [16.7, 16.7, 15.5], load=(1.1, 1))
    sheet.blot(603, 113, 34.5, squash=0.72, angle=-0.08)
    sheet.stroke([(579, 120), (594, 139)], [7.7, 10.3, 9, 5.2], load=(1.1, 1))
    sheet.stroke(
        [(574, 116), (598, 115), (615, 117)],
        [2.4, 5.4, 5.8, 5, 1.6],
        load=(1.3, 1.3),
        lift=True,
        feather=0.2,
        bite=0.3,
    )

    # near leg, lifting
    sheet.stroke(
        [(636, 355), (661, 413), (684, 466)],
        [23.2, 25.8, 24.5, 21.9, 16.7],
        load=(1.25, 1.15, 1.02, 0.9),
        bias=-0.15,
        feather=0.2,
    )
    sheet.stroke(
        [(679, 372), (693, 422), (702, 462)], [5, 9.5, 10, 8, 3.9], load=(1, 0.9, 0.75), bias=-0.3
    )
    joint(sheet, 692, 475, 20.7, pivot=3.5)
    sheet.stroke(
        [(702, 482), (750, 515), (789, 552)],
        [18, 16.7, 15.5, 12.9, 10.3],
        load=(1.1, 0.98, 0.82),
        bias=-0.25,
    )
    joint(sheet, 791, 557, 12.5, pivot=2.8)
    sheet.stroke(
        [(833, 561), (736, 596)], [14.2, 14.2, 12.9, 9, 3.9], load=(1.1, 1, 0.9), feather=0.2
    )
    sheet.spatter(861, 583, 30, 7)

    # near arm, swinging forward
    joint(sheet, 613, 184, 21.8, glint=4.5, pivot=3, ring=1.5)
    sheet.stroke(
        [(608, 196), (592, 224), (579, 254)], [16.7, 16.7, 15.5, 12.9], load=(1.1, 0.95), bias=0.2
    )
    joint(sheet, 578, 255, 15.5, pivot=2.6, ring=1.2)
    sheet.stroke(
        [(572, 262), (550, 291), (525, 309)], [14.2, 14.2, 12.9, 10.3], load=(1.04, 0.88), bias=0.25
    )
    hand(sheet, (524, 310), (482, 348), 13.8)


def save(ink, name):
    plate = Image.fromarray(ink.astype(np.uint8), "P")
    plate.putpalette(PAPER + INK)
    plate.save(IMG / name, optimize=True)
    print(f"{name}: {(IMG / name).stat().st_size:,} bytes")


def main():
    sheet = Sheet(SEED)
    draw(sheet)
    save(sheet.ink, "proj-humanoid-ink-2x.png")
    grey = Image.fromarray(np.where(sheet.ink, 0, 255).astype(np.uint8)).resize(
        (W // 2, H // 2), Image.BOX
    )
    save(
        np.asarray(grey.convert("1", dither=Image.Dither.FLOYDSTEINBERG)) == 0,
        "proj-humanoid-ink.png",
    )


if __name__ == "__main__":
    main()
