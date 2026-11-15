"""The Go2 plates for the fold of index.html: the Unitree Go2 posed and rendered in
MuJoCo under one moon, then printed as the page prints: NAME-night.png (paper through
a Bayer 4 x 4 screen, on transparent) over NAME-shade.png (its silhouette in sumi).

    python3 tools/make-go2.py --out DIR --name go2 [pose] [camera] [light] [print]

The fold's plates (then delete img/go2-tone.png and img/go2-preview.png):

    python3 tools/make-go2.py --out img --name go2 --azimuth 138 --elevation 6
        --distance 0.78 --fov 39.357 --lookat=0.0694,-0.0532,0.1948 --height 0.30
        --yaw=-10 --pitch 4 --light 160,50 --flip --size 787x840

Also writes NAME-tone.png and NAME-preview.png to look at, and prints where the figure
is on the plate, in fractions of it (x from the left, y from the top). --sheet N puts N
frames of the trot in one sheet with a NAME.json index. Angles are in degrees, lengths
in metres. The model is MuJoCo Menagerie's unitree_go2 (Unitree Robotics, BSD-3-Clause).
Needs mujoco, numpy and Pillow.
"""

import argparse
import json
import math
import os
import pathlib
import random

os.environ.setdefault("MUJOCO_GL", "osmesa")

import mujoco
import numpy as np
from PIL import Image, ImageFilter, ImageOps

GO2_XML = "/home/user/google-deepmind/mujoco_menagerie/unitree_go2/go2.xml"
PAPER = (233, 231, 226)
SUMI = (20, 20, 22)
SHADE = (20, 20, 20)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]])
OVERSAMPLE = 3
BLOT_PX = 9

# the mesh's materials as print tones: dark trunk and calves, pale thigh shells
TONE = {"black": 0.04, "gray": 0.22, "metal": 0.9, "white": 1.0}
SPECULAR = 1.0
SHININESS = 0.15
# the fill: on the camera's side, across from the moon and a little low
FILL_AZIMUTH_DEG = 45
FILL_ELEVATION_DEG = -15

# the legs, from go2.xml: hip joints in the trunk's frame, then the links
HIPS = {
    "FL": (0.1934, 0.0465),
    "FR": (0.1934, -0.0465),
    "RL": (-0.1934, 0.0465),
    "RR": (-0.1934, -0.0465),
}
THIGH_Y = 0.0955
THIGH_M = 0.213
CALF_M = 0.213
HOME_Z = 0.27
HOME_THIGH = 0.9
HOME_CALF = -1.8

# places on the trunk, in its own frame
HEAD_TOP = (0.22, 0.0, 0.089)
HEAD_FRONT = (0.332, 0.0, 0.02)
BACK = ((-0.128, 0.0, 0.062), (0.06, 0.0, 0.06))


def numbers(count):
    def parse(text):
        values = [float(part) for part in text.split(",")]
        if len(values) != count:
            raise argparse.ArgumentTypeError(f"{count} numbers, comma-separated")
        return values

    return parse


def plate_size(text):
    width, height = text.split("x")
    return int(width), int(height)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", required=True, help="directory for the plates")
    parser.add_argument("--name", default="go2")
    parser.add_argument("--model", default=GO2_XML, help="path to go2.xml")
    parser.add_argument("--sheet", type=int, metavar="N", help="N trot frames")

    group = parser.add_argument_group("pose")
    group.add_argument("--pose", choices=("stand", "trot"), default="stand")
    group.add_argument("--phase", type=float, default=0.25, help="trot cycle, 0 to 1")
    group.add_argument("--stride", type=float, default=0.2, help="trot step length")
    group.add_argument("--lift", type=float, default=0.07, help="trot foot clearance")
    group.add_argument("--yaw", type=float, default=0.0, help="nose left, feet planted")
    group.add_argument("--pitch", type=float, default=0.0, help="nose up, feet planted")
    group.add_argument("--roll", type=float, default=0.0, help="right side down")
    group.add_argument("--height", type=float, default=HOME_Z, help="trunk height")
    group.add_argument("--qpos", type=numbers(19), help="19 numbers: a whole pose")

    group = parser.add_argument_group("camera")
    group.add_argument(
        "--azimuth",
        type=float,
        default=90.0,
        help="90 sees the right flank, 270 the left, 180 the face",
    )
    group.add_argument(
        "--elevation", type=float, default=-8.0, help="negative looks down on it"
    )
    group.add_argument("--distance", type=float, default=1.8)
    group.add_argument(
        "--lookat", type=numbers(3), default=[-0.035, 0.0, 0.16], metavar="X,Y,Z"
    )
    group.add_argument("--fov", type=float, default=20.0, help="vertical, degrees")
    group.add_argument("--flip", action="store_true", help="mirror the finished plate")

    group = parser.add_argument_group("light")
    group.add_argument(
        "--light",
        type=numbers(2),
        default=[140.0, 50.0],
        metavar="AZ,EL",
        help="the moon: AZ 0 at the camera, 90 at the plate's right, 180 behind"
        " the figure, 270 at the plate's left; EL above the horizon",
    )
    group.add_argument("--fill", type=float, default=0.5, help="bounce light, 0 to 1")

    group = parser.add_argument_group("print")
    group.add_argument("--size", type=plate_size, default=(900, 600), metavar="WxH")
    group.add_argument("--black", type=float, default=0.075, help="tone left as ground")
    group.add_argument("--white", type=float, default=0.36, help="tone printed solid")
    group.add_argument("--gamma", type=float, default=1.25)
    group.add_argument(
        "--sink",
        type=numbers(2),
        metavar="FROM,TO",
        help="dissolve toward the feet between these fractions of the plate's height",
    )
    return parser.parse_args()


def direction(azimuth, elevation):
    az = math.radians(azimuth)
    el = math.radians(elevation)
    level = math.cos(el)
    return np.array([level * math.cos(az), level * math.sin(az), math.sin(el)])


def lit_model(args):
    """the model with the moon, its fill and the print's tones"""
    moon_az, moon_el = args.light
    fill_az = -math.copysign(FILL_AZIMUTH_DEG, math.sin(math.radians(moon_az)))
    spec = mujoco.MjSpec.from_file(args.model)
    # the lettering is left off: in the fold it reads as an advert
    for geom in spec.geoms:
        if geom.material == "white":
            geom.group = 3
    spec.worldbody.add_light(
        type=mujoco.mjtLightType.mjLIGHT_DIRECTIONAL,
        dir=-direction(args.azimuth + 180 + moon_az, moon_el),
        diffuse=[1.0] * 3,
        specular=[1.0] * 3,
        castshadow=True,
    )
    spec.worldbody.add_light(
        type=mujoco.mjtLightType.mjLIGHT_DIRECTIONAL,
        dir=-direction(args.azimuth + 180 + fill_az, FILL_ELEVATION_DEG),
        diffuse=[args.fill] * 3,
        specular=[0.0] * 3,
        castshadow=False,
    )
    model = spec.compile()
    width, height = args.size
    model.vis.headlight.active = 0
    model.vis.global_.fovy = args.fov
    model.vis.global_.offwidth = width * OVERSAMPLE
    model.vis.global_.offheight = height * OVERSAMPLE
    for name, tone in TONE.items():
        model.material(name).rgba[:3] = tone
    model.mat_specular[:] = SPECULAR
    model.mat_shininess[:] = SHININESS
    return model


def home_feet():
    """the four feet of the home pose, in the world"""
    drop = THIGH_M * math.cos(HOME_THIGH) + CALF_M * math.cos(HOME_THIGH + HOME_CALF)
    feet = {}
    for leg, (x, y) in HIPS.items():
        feet[leg] = np.array([x, y + math.copysign(THIGH_Y, y), HOME_Z - drop])
    return feet


def trot(feet, phase, stride, lift):
    """a diagonal-pair trot: FL and RR stand for the first half cycle, then FR and RL"""
    for leg in feet:
        t = (phase + (0.5 if leg in ("FR", "RL") else 0.0)) % 1.0
        if t < 0.5:
            feet[leg][0] += stride * (0.5 - 2 * t)
        else:
            # the swing foot follows a cycloid
            swing = 2 * math.pi * (2 * t - 1)
            feet[leg][0] += stride * ((swing - math.sin(swing)) / (2 * math.pi) - 0.5)
            feet[leg][2] += lift * (1 - math.cos(swing)) / 2


def leg_angles(leg, foot):
    """hip, thigh and calf angles that put the foot at a point in the trunk's frame"""
    hip_x, hip_y = HIPS[leg]
    x = foot[0] - hip_x
    y = foot[1] - hip_y
    z = foot[2]
    drop2 = y * y + z * z - THIGH_Y**2
    reach2 = x * x + drop2
    if drop2 <= 0 or reach2 >= (THIGH_M + CALF_M) ** 2:
        raise SystemExit(f"{leg} cannot reach its foot in this pose")
    drop = math.sqrt(drop2)
    hip = math.atan2(z, y) - math.atan2(-drop, math.copysign(THIGH_Y, hip_y))
    # the knee bends backwards
    calf = -math.acos((reach2 - THIGH_M**2 - CALF_M**2) / (2 * THIGH_M * CALF_M))
    shin_x = CALF_M * math.sin(calf)
    shin_z = THIGH_M + CALF_M * math.cos(calf)
    thigh = math.atan2(-x, drop) - math.atan2(shin_x, shin_z)
    return hip, thigh, calf


def pose(args, phase):
    """qpos: the feet stay where the gait puts them and the trunk moves over them"""
    feet = home_feet()
    if phase is not None:
        trot(feet, phase, args.stride, args.lift)
    centre = np.array([0.0, 0.0, args.height])
    quat = np.zeros(4)
    mujoco.mju_euler2Quat(quat, np.radians([args.yaw, -args.pitch, args.roll]), "zyx")
    turn = np.zeros(9)
    mujoco.mju_quat2Mat(turn, quat)
    turn = turn.reshape(3, 3)
    joints = []
    for leg in HIPS:
        joints += leg_angles(leg, turn.T @ (feet[leg] - centre))
    return np.concatenate([centre, quat, joints])


def check_joints(model, qpos):
    for joint in range(1, model.njnt):
        angle = qpos[model.jnt_qposadr[joint]]
        low, high = model.jnt_range[joint]
        if low <= angle <= high:
            continue
        name = model.joint(joint).name
        raise SystemExit(f"{name} at {angle:.2f} is outside {low:.2f} to {high:.2f}")


def smooth(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def opened(mask, size):
    """the mask without anything narrower than size px"""
    image = Image.fromarray(mask.astype(np.uint8) * 255)
    image = image.filter(ImageFilter.MinFilter(size))
    image = image.filter(ImageFilter.MaxFilter(size))
    return np.asarray(image) > 0


def render(renderer, data, camera):
    """luminance and silhouette at the plate's size"""
    height = renderer.height // OVERSAMPLE
    width = renderer.width // OVERSAMPLE
    renderer.update_scene(data, camera)
    renderer.disable_segmentation_rendering()
    light = renderer.render().mean(axis=2) / 255
    renderer.enable_segmentation_rendering()
    solid = renderer.render()[..., 0] >= 0
    cells = (height, OVERSAMPLE, width, OVERSAMPLE)
    cover = solid.reshape(cells).sum(axis=(1, 3))
    tone = (light * solid).reshape(cells).sum(axis=(1, 3)) / np.maximum(cover, 1)
    inside = cover * 2 >= OVERSAMPLE**2
    # pinholes between parts would let the moon through
    return tone, ~opened(~inside, 3)


def screen(tone, inside, args):
    """the tone curve, then the page's Bayer screen at one plate pixel"""
    height, width = tone.shape
    tone = np.clip((tone - args.black) / (args.white - args.black), 0.0, 1.0)
    tone = tone**args.gamma
    threshold = np.tile(BAYER, (height // 4 + 1, width // 4 + 1))[:height, :width]
    # no tint under a quarter: sparser dots read as a dot matrix, not as ink
    threshold = np.maximum(threshold, 3)
    return tone * inside, inside & (tone * 16 > threshold + 0.5)


def sink(inside, paper, start, end):
    """the legs dissolve toward the feet: patches drop out, the paper first"""
    height, width = inside.shape
    rnd = random.Random(31)
    across = width // BLOT_PX + 2
    down = height // BLOT_PX + 2
    grains = (rnd.gauss(128, 64) for _ in range(across * down))
    lattice = bytes(min(255, max(0, int(grain))) for grain in grains)
    blot = Image.frombytes("L", (across, down), lattice)
    blot = blot.resize((across * BLOT_PX, down * BLOT_PX), Image.BILINEAR)
    blot = blot.crop((0, 0, width, height)).filter(ImageFilter.GaussianBlur(3))
    blot = (np.asarray(ImageOps.equalize(blot)) + 0.5) / 256
    depth = ((np.arange(height) + 0.5) / height - start) / (end - start)
    keep = opened(blot < 1 - smooth(depth)[:, None], 5)
    keep = ~opened(~keep, 5)
    shade = inside & keep
    sinking = depth > 0
    shade[sinking] = opened(shade, 3)[sinking]
    paper = paper & shade & (blot < 1 - smooth(2 * depth)[:, None])
    return shade, paper


def plate_facts(model, data, args, inside, paper):
    """where the figure is on the plate"""
    height, width = inside.shape
    forward = direction(args.azimuth, args.elevation)
    right = direction(args.azimuth - 90, 0)
    up = np.cross(right, forward)
    eye = np.array(args.lookat) - args.distance * forward
    focal = 0.5 / math.tan(math.radians(args.fov) / 2)

    def place(point):
        ray = point - eye
        x = 0.5 + focal * (ray @ right) / (ray @ forward) * height / width
        y = 0.5 - focal * (ray @ up) / (ray @ forward)
        if args.flip:
            x = 1 - x
        return np.round([x, y], 3).tolist()

    trunk = data.body("base")
    turn = trunk.xmat.reshape(3, 3)
    rows = np.flatnonzero(inside.any(axis=1))
    columns = np.flatnonzero(inside.any(axis=0))
    edges = np.array([columns[0], rows[0], columns[-1] + 1, rows[-1] + 1])
    figure = edges / [width, height, width, height]
    feet = {}
    for leg in HIPS:
        feet[leg] = place(data.geom(leg).xpos - [0, 0, model.geom(leg).size[0]])
    return {
        "figure": figure.round(3).tolist(),
        "head_top": place(trunk.xpos + turn @ HEAD_TOP),
        "head_front": place(trunk.xpos + turn @ HEAD_FRONT),
        "back": [place(trunk.xpos + turn @ end) for end in BACK],
        "feet": feet,
        "paper": round(float(paper.sum() / inside.sum()), 3),
    }


def plate(args, model, renderer, qpos):
    """one pose as tone, shade and paper, with its facts"""
    check_joints(model, qpos)
    data = mujoco.MjData(model)
    data.qpos[:] = qpos
    mujoco.mj_forward(model, data)
    camera = mujoco.MjvCamera()
    camera.azimuth = args.azimuth
    camera.elevation = args.elevation
    camera.distance = args.distance
    camera.lookat[:] = args.lookat
    tone, inside = render(renderer, data, camera)
    if args.flip:
        tone = tone[:, ::-1]
        inside = inside[:, ::-1]
    tone, paper = screen(tone, inside, args)
    facts = plate_facts(model, data, args, inside, paper)
    if args.sink:
        inside, paper = sink(inside, paper, *args.sink)
    return tone, inside, paper, facts


def save_plate(mask, colour, path):
    image = Image.fromarray(mask.astype(np.uint8), "P")
    image.putpalette([*colour, *colour])
    image.save(path, optimize=True, transparency=0)
    print(path.name, path.stat().st_size, "bytes")


def save(out, name, tone, shade, paper):
    save_plate(paper, PAPER, out / f"{name}-night.png")
    save_plate(shade, SHADE, out / f"{name}-shade.png")
    grey = np.round(tone * 255).astype(np.uint8)
    Image.fromarray(grey, "L").save(out / f"{name}-tone.png")
    preview = np.empty((*shade.shape, 3), np.uint8)
    preview[:] = SUMI
    preview[shade] = SHADE
    preview[paper] = PAPER
    Image.fromarray(preview, "RGB").save(out / f"{name}-preview.png")


def main():
    args = arguments()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    width, height = args.size
    if args.sheet:
        phases = [round(step / args.sheet, 4) for step in range(args.sheet)]
    elif args.pose == "trot":
        phases = [args.phase]
    else:
        phases = [None]
    columns = math.ceil(math.sqrt(len(phases)))
    rows = math.ceil(len(phases) / columns)
    tone = np.zeros((rows * height, columns * width))
    shade = np.zeros(tone.shape, bool)
    paper = np.zeros(tone.shape, bool)
    frames = []
    model = lit_model(args)
    with mujoco.Renderer(model, height * OVERSAMPLE, width * OVERSAMPLE) as renderer:
        for index, phase in enumerate(phases):
            qpos = np.array(args.qpos) if args.qpos else pose(args, phase)
            x = index % columns * width
            y = index // columns * height
            cell = (slice(y, y + height), slice(x, x + width))
            printed = plate(args, model, renderer, qpos)
            tone[cell], shade[cell], paper[cell], facts = printed
            frames.append({"x": x, "y": y, "phase": phase, **facts})
    save(out, args.name, tone, shade, paper)
    if args.sheet:
        lines = ",\n".join(json.dumps(entry) for entry in frames)
        text = f'{{"frame": [{width}, {height}], "frames": [\n{lines}\n]}}\n'
        (out / f"{args.name}.json").write_text(text)
        print(f"{args.name}.json", len(frames), "frames of", width, "x", height)
    else:
        print("size      ", [width, height])
        for key, value in facts.items():
            print(f"{key:10}", value)


if __name__ == "__main__":
    main()
