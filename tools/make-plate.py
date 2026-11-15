#!/usr/bin/env python3
"""Draw two project plates in dry brush ink, each with its -2x twin: img/proj-humanoid-ink.png,
a Unitree G1 walking, and img/proj-rl-isaaclab-ink.png, Go2s training side by side.

    pip install numpy pillow
    python tools/make-plate.py

Proportions and joint positions come from the G1 and Go2 models in MuJoCo Menagerie. The G1 is
posed mid-stride and seen from the side; the Go2s trot, one to a cell, and a few have fallen.
"""
import pathlib

import numpy as np
from PIL import Image

IMG = pathlib.Path(__file__).resolve().parent.parent / "img"
W, H = 1280, 720
STEP = 0.5
PAPER = (233, 231, 226)
INK = (17, 17, 20)

# Go2 sizes in metres, from unitree_go2 in MuJoCo Menagerie, and the trunk height of its trot
TRUNK = np.array([0.3762, 0.0935, 0.114])
HIP = np.array([0.1934, 0.0465, 0.0])
THIGH_OUT = 0.0955
LEG = 0.213
LEGS = {"FL": (1, 1), "FR": (1, -1), "RL": (-1, 1), "RR": (-1, -1)}
STAND = 0.32

# three that fell or are falling, by (column, row): trunk height, turn, pitch and roll, then
# the thigh, calf and splay joint angles of the FL, FR, RL and RR legs
FALLEN = {
    # on its back
    (1, 1): (
        (0.075, 0.5, 0.06, np.pi - 0.2),
        [(0.35, -1.1, 0.35), (0.9, -1.5, 0.2), (0.6, -1.7, 0.3), (0.15, -1.2, 0.45)],
    ),
    # face down
    (4, 2): (
        (0.2, -0.25, 0.62, 0.12),
        [(2.0, -2.6, 0.25), (1.8, -2.5, 0.35), (0.15, -0.55, 0.1), (-0.1, -0.6, 0.1)],
    ),
    # a front knee giving way
    (3, 0): (
        (0.21, 0.2, 0.33, 0.15),
        [(1.45, -2.6, 0.1), (-0.35, -0.55, 0.15), (0.55, -1.05, 0.0), (0.75, -1.2, 0.05)],
    ),
}


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


def draw_humanoid(sheet):
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


def rotation(yaw, pitch, roll):
    """body to world, x ahead, y left, z up: pitch tips the nose down, roll lifts the left side"""
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cr, sr = np.cos(roll), np.sin(roll)
    return (
        np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
        @ np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
        @ np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    )


class Camera:
    """a pinhole camera over the ground, which is the plane z = 0"""

    def __init__(self, eye, target, focal):
        self.eye = np.asarray(eye, float)
        ahead = np.subtract(target, eye)
        self.ahead = ahead / np.linalg.norm(ahead)
        right = np.cross(self.ahead, (0, 0, 1))
        self.right = right / np.linalg.norm(right)
        self.up = np.cross(self.right, self.ahead)
        self.focal = focal

    def __call__(self, point):
        """where a point lands on the sheet, and how many pixels a metre spans there"""
        d = np.asarray(point, float) - self.eye
        depth = d @ self.ahead
        x = W / 2 + self.focal * (d @ self.right) / depth
        y = H / 2 - self.focal * (d @ self.up) / depth
        return np.array([x, y]), self.focal / depth


def leg_joints(name, thigh, calf, splay=0.0):
    """hip, top of the thigh, knee and foot of one leg, in the body frame"""
    fore, side = LEGS[name]
    out = rotation(0, 0, side * splay)
    hip = HIP * (fore, side, 1)
    top = hip + out @ (0, side * THIGH_OUT, 0)
    knee = top + out @ (-LEG * np.sin(thigh), 0, -LEG * np.cos(thigh))
    foot = knee + out @ (-LEG * np.sin(thigh + calf), 0, -LEG * np.cos(thigh + calf))
    return hip, top, knee, foot


def trot(phase):
    """thigh and calf joint angles at one moment of a trot, diagonal pairs half a cycle apart"""
    stride, lift, stance = 0.12, 0.07, 0.55
    angles = {}
    for name, offset in (("FL", 0), ("RR", 0), ("FR", 0.5), ("RL", 0.5)):
        t = (phase + offset) % 1
        if t < stance:
            x = stride * (1 - 2 * t / stance)
            z = -STAND
        else:
            s = (t - stance) / (1 - stance)
            x = stride * (2 * s * s * (3 - 2 * s) - 1)
            z = -STAND + lift * np.sin(np.pi * s)
        # thigh and calf are the same length, so the knee splits the angle evenly
        half = np.arccos(np.hypot(x, z) / (2 * LEG))
        angles[name] = (np.arctan2(-x, -z) + half, -2 * half)
    return angles


def go2(sheet, camera, at, yaw, legs, load, pitch=0.0, roll=0.0):
    """a Go2 with its trunk centre at `at`, cut out of whatever lies behind it: the far legs,
    then the trunk and head, then the near legs"""
    body = rotation(yaw, pitch, roll)
    _, scale = camera(at)
    # the farther, smaller robots get finer nicks along the brush edge
    bite = min(0.8, 0.2 + 0.003 * scale)
    upright = body[2, 2] > 0.9

    def seen(point):
        return camera(at + body @ point)[0]

    def size(metres, least=1.0):
        return max(least, metres * scale)

    joints = {name: leg_joints(name, *angles) for name, angles in legs.items()}
    order = sorted(LEGS, key=lambda n: np.linalg.norm(at + body @ joints[n][1] - camera.eye))
    near, far = order[:2], order[2:]

    def leg(name, wet, lift=False, margin=0.0):
        _, top, knee, foot = (seen(p) for p in joints[name])
        sheet.stroke(
            [top, knee],
            [size(0.04) + margin, size(0.044) + margin, size(0.03) + margin, size(0.022) + margin],
            load=(wet, wet, 0.85 * wet),
            lift=lift,
            bias=0 if lift else 0.25,
            bite=bite,
            feather=0.25,
        )
        sheet.stroke(
            [knee, foot],
            [
                size(0.022) + margin,
                size(0.019) + margin,
                size(0.013, 0.9) + margin,
                size(0.016, 0.9) + margin,
            ],
            load=(0.95 * wet, 0.85 * wet),
            lift=lift,
            bite=bite,
            feather=0.25,
        )

    # the trunk runs a little past the hips, as the brush does in the vlm plate
    half = TRUNK / 2
    rear = seen((-half[0] - 0.045, 0, 0))
    front = seen((half[0] + 0.045, 0, 0))
    along = (front - rear) / np.hypot(*(front - rear))
    across = np.array([-along[1], along[0]])
    spread = [
        (seen(half * (x, y, z)) - rear) @ across for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)
    ]
    shift = across * (max(spread) + min(spread)) / 2
    rear, front = rear + shift, front + shift
    thick = 0.36 * (max(spread) - min(spread))
    head = seen((0.25, 0, -0.005))

    for name in near:
        leg(name, 1.3, lift=True, margin=2)
    sheet.stroke(
        [rear, front], [thick + 3, thick + 3], load=(1.3, 1.3), lift=True, feather=0.15, bite=0.2
    )
    sheet.blot(*head, size(0.05) + 3, lift=True)

    for name in far:
        leg(name, 0.85 * load)
    # `across` is the stroke's normal, so this sign dries its lower edge, the belly
    sheet.stroke(
        [rear, (rear + front) / 2, front],
        [0.85 * thick, thick, thick, 0.95 * thick],
        load=(0.75 * load, 1.15 * load, 1.1 * load, 1.05 * load),
        bias=0.3 * np.sign(across[1]),
        feather=0.15,
        bite=bite,
        attack=1,
    )
    if upright:
        back = -np.sign(across[1]) * across * 0.42 * thick
        sheet.stroke(
            [rear + back + 0.08 * (front - rear), front + back - 0.12 * (front - rear)],
            [0.6, max(0.9, 0.06 * thick), max(0.9, 0.06 * thick), 0.5],
            load=(1.3, 1.3),
            lift=True,
            feather=0.2,
            bite=0.3,
        )
    sheet.blot(*head, size(0.05), squash=0.85, angle=np.arctan2(along[1], along[0]))
    sheet.blot(*seen((0.285, 0, -0.045)), size(0.034), rough=0.1)
    for name in near:
        leg(name, 1.1 * load)
    if upright:
        for name in near:
            fore, side = LEGS[name]
            r = size(0.042, 1.5)
            joint(sheet, *seen(HIP * (fore, side, 1) + (0, side * 0.075, 0)), r, pivot=0.2 * r)


def floor(sheet, camera, columns, rows, cell):
    """rule the ground into one cell per robot, the lines running past the field and drying out"""
    xs = (np.arange(columns + 1) - columns / 2) * cell[0]
    ys = (np.arange(rows + 1) - 0.5) * cell[1]
    lines = [((x, ys[0] - 0.3 * cell[1]), (x, ys[-1] + 0.3 * cell[1])) for x in xs]
    lines += [((xs[0] - 0.3 * cell[0], y), (xs[-1] + 0.3 * cell[0], y)) for y in ys]
    for start, end in lines:
        a, scale_a = camera((*start, 0))
        b, scale_b = camera((*end, 0))
        sheet.stroke(
            [a, b],
            [max(1.1, 0.0065 * scale_a), max(1.1, 0.0065 * scale_b)],
            load=(0.2, 0.85, 0.85, 0.2),
            bias=0.15,
            feather=0.3,
            bite=0.3,
        )


def draw_isaaclab(sheet):
    camera = Camera(eye=(0, -4.3, 2.9), target=(0, 1.2, 0), focal=1200)
    columns, rows, cell = 5, 3, (1.0, 1.15)
    floor(sheet, camera, columns, rows, cell)
    rng = sheet.rng
    for row in reversed(range(rows)):
        for column in range(columns):
            x = (column - (columns - 1) / 2) * cell[0] + 0.1 * rng.standard_normal()
            y = row * cell[1] + 0.1 * rng.standard_normal()
            yaw = np.radians(186) + 0.04 * rng.standard_normal()
            phase = rng.random()
            load = 1 - 0.3 * row / (rows - 1)
            if (column, row) in FALLEN:
                (height, turn, pitch, roll), angles = FALLEN[column, row]
                legs = dict(zip(LEGS, angles))
                go2(sheet, camera, (x, y, height), yaw + turn, legs, load, pitch, roll)
            else:
                go2(sheet, camera, (x, y, STAND), yaw, trot(phase), load)


def save(ink, name):
    plate = Image.fromarray(ink.astype(np.uint8), "P")
    plate.putpalette(PAPER + INK)
    plate.save(IMG / name, optimize=True)
    print(f"{name}: {(IMG / name).stat().st_size:,} bytes")


def main():
    for name, draw, seed in (
        ("proj-humanoid-ink", draw_humanoid, 11),
        ("proj-rl-isaaclab-ink", draw_isaaclab, 12),
    ):
        sheet = Sheet(seed)
        draw(sheet)
        save(sheet.ink, f"{name}-2x.png")
        grey = Image.fromarray(np.where(sheet.ink, 0, 255).astype(np.uint8)).resize(
            (W // 2, H // 2), Image.BOX
        )
        save(
            np.asarray(grey.convert("1", dither=Image.Dither.FLOYDSTEINBERG)) == 0,
            f"{name}.png",
        )


if __name__ == "__main__":
    main()
