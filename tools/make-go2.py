"""The Go2 plates for the fold of index.html: the Unitree Go2 posed and rendered in MuJoCo
under one moon, then printed as the page prints, paper through a Bayer 4 x 4 screen
(NAME-night.png) over the silhouette in sumi (NAME-shade.png), each also at twice the
size (-2x) with the same screen, so the dots keep their size on every display.

    python3 tools/make-go2.py --out img --name go2 --size 534x480 --azimuth 216 \\
        --elevation 6 --distance 3.2 --fov 9.192 --lookat=-0.0262,-0.0031,0.2103 \\
        --height 0.30 --yaw 10 --pitch 4 --light 252,46 --fill 0.14 --black 0.06 \\
        --white 0.2 --gamma 1.0 --fade 0.66,0.97

Also writes NAME-preview.png to look at (not shipped), and prints where the figure is on
the plate, in fractions of it (x from the left, y from the top). Angles are in degrees,
lengths in metres. The model is MuJoCo Menagerie's unitree_go2 (Unitree Robotics,
BSD-3-Clause). Needs mujoco, numpy and Pillow.
"""

import argparse
import math
import os
import pathlib

os.environ.setdefault("MUJOCO_GL", "osmesa")

import mujoco
import numpy as np
from PIL import Image, ImageFilter

GO2_XML = "/home/user/google-deepmind/mujoco_menagerie/unitree_go2/go2.xml"
PAPER = (233, 231, 226)
SUMI = (20, 20, 22)
SHADE = (20, 20, 20)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]])
OVERSAMPLE = 3

# the mesh's materials as print tones: the trunk near black, the shells lighter
TONE = {"black": 0.04, "gray": 0.12, "metal": 0.6, "white": 1.0}
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

    group = parser.add_argument_group("pose: the feet stay planted, the trunk moves")
    group.add_argument("--yaw", type=float, default=0.0, help="nose to its left")
    group.add_argument("--pitch", type=float, default=0.0, help="nose up")
    group.add_argument("--roll", type=float, default=0.0, help="right side down")
    group.add_argument("--height", type=float, default=HOME_Z, help="trunk height")

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
        "--fade",
        type=numbers(2),
        metavar="FROM,TO",
        help="the screen thins out toward the feet between these fractions of the height",
    )
    return parser.parse_args()


def direction(azimuth, elevation):
    az = math.radians(azimuth)
    el = math.radians(elevation)
    level = math.cos(el)
    return np.array([level * math.cos(az), level * math.sin(az), math.sin(el)])


def lit_model(args):
    """the model with the moon, its fill and the print's tones, sized for the 2x plate"""
    moon_az, moon_el = args.light
    fill_az = -math.copysign(FILL_AZIMUTH_DEG, math.sin(math.radians(moon_az)))
    spec = mujoco.MjSpec.from_file(args.model)
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
    model.vis.global_.offwidth = 2 * width * OVERSAMPLE
    model.vis.global_.offheight = 2 * height * OVERSAMPLE
    for name, tone in TONE.items():
        model.material(name).rgba[:3] = tone
    model.mat_specular[:] = SPECULAR
    model.mat_shininess[:] = SHININESS
    return model


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


def pose(args):
    """qpos: the feet where they stand at home, the trunk moved over them"""
    drop = THIGH_M * math.cos(HOME_THIGH) + CALF_M * math.cos(HOME_THIGH + HOME_CALF)
    centre = np.array([0.0, 0.0, args.height])
    quat = np.zeros(4)
    mujoco.mju_euler2Quat(quat, np.radians([args.yaw, -args.pitch, args.roll]), "zyx")
    turn = np.zeros(9)
    mujoco.mju_quat2Mat(turn, quat)
    turn = turn.reshape(3, 3)
    joints = []
    for leg, (x, y) in HIPS.items():
        foot = np.array([x, y + math.copysign(THIGH_Y, y), HOME_Z - drop])
        joints += leg_angles(leg, turn.T @ (foot - centre))
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


def render(renderer, data, camera, lettering):
    """luminance, silhouette and the lettering's pixels at the plate's size"""
    height = renderer.height // OVERSAMPLE
    width = renderer.width // OVERSAMPLE
    renderer.update_scene(data, camera)
    renderer.disable_segmentation_rendering()
    light = renderer.render().mean(axis=2) / 255
    renderer.enable_segmentation_rendering()
    segments = renderer.render()
    solid = segments[..., 0] >= 0
    geoms = segments[..., 1] == mujoco.mjtObj.mjOBJ_GEOM
    letters = geoms & np.isin(segments[..., 0], lettering)
    cells = (height, OVERSAMPLE, width, OVERSAMPLE)
    cover = solid.reshape(cells).sum(axis=(1, 3))
    tone = (light * solid).reshape(cells).sum(axis=(1, 3)) / np.maximum(cover, 1)
    inside = cover * 2 >= OVERSAMPLE**2
    lettered = letters.reshape(cells).any(axis=(1, 3))
    return tone, inside, lettered


def neighbours(values):
    """the sum of each pixel's 3 x 3 block"""
    padded = np.pad(values, 1)
    height, width = values.shape
    blocks = [padded[y : y + height, x : x + width] for y in range(3) for x in range(3)]
    return sum(blocks)


def unlettered(tone, inside, lettered, scale):
    """the shell without its lettering: the tone round it, grown in ring by ring"""
    # grown past the letters: the recess they sit in prints its own edges
    grown = Image.fromarray(lettered.astype(np.uint8) * 255)
    grown = grown.filter(ImageFilter.MaxFilter(4 * scale + 1))
    hole = (np.asarray(grown) > 0) & inside
    have = inside & ~hole
    value = np.where(have, tone, 0.0)
    ring = hole
    while ring.any():
        count = neighbours(have.astype(float))
        ring = hole & ~have & (count > 0)
        value[ring] = neighbours(value)[ring] / np.maximum(count[ring], 1)
        have |= ring
    return np.where(hole, value, tone)


def threshold(height, width, scale):
    """the Bayer screen, one cell per 1x plate pixel"""
    cell = np.kron(BAYER, np.ones((scale, scale), int))
    size = 4 * scale
    return np.tile(cell, (height // size + 1, width // size + 1))[:height, :width]


def printed(tone, inside, args, scale):
    """the tone curve and the screen; the fade thins both plates toward the feet"""
    height, width = tone.shape
    screen = threshold(height, width, scale)
    tone = np.clip((tone - args.black) / (args.white - args.black), 0.0, 1.0)
    tone = tone**args.gamma
    if args.fade:
        start, end = args.fade
        depth = ((np.arange(height) + 0.5) / height - start) / (end - start)
        keep = 1 - smooth(depth)[:, None]
        tone = tone * keep
        inside = inside & (keep * 16 > screen + 0.5)
    # no tint under a quarter: sparser dots read as a dot matrix, not as ink
    paper = inside & (tone * 16 > np.maximum(screen, 3) + 0.5)
    return inside, paper


def plate_facts(data, args, inside, paper):
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
        return np.round([x, y], 3).tolist()

    trunk = data.body("base")
    turn = trunk.xmat.reshape(3, 3)
    rows = np.flatnonzero(inside.any(axis=1))
    columns = np.flatnonzero(inside.any(axis=0))
    edges = np.array([columns[0], rows[0], columns[-1] + 1, rows[-1] + 1])
    return {
        "figure": (edges / [width, height, width, height]).round(3).tolist(),
        "head_top": place(trunk.xpos + turn @ HEAD_TOP),
        "head_front": place(trunk.xpos + turn @ HEAD_FRONT),
        "paper": round(float(paper.sum() / inside.sum()), 3),
    }


def save_plate(mask, colour, path):
    image = Image.fromarray(mask.astype(np.uint8), "P")
    image.putpalette([*colour, *colour])
    image.save(path, optimize=True, transparency=0)
    print(path.name, path.stat().st_size, "bytes")


def main():
    args = arguments()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = lit_model(args)
    qpos = pose(args)
    check_joints(model, qpos)
    data = mujoco.MjData(model)
    data.qpos[:] = qpos
    mujoco.mj_forward(model, data)
    camera = mujoco.MjvCamera()
    camera.azimuth = args.azimuth
    camera.elevation = args.elevation
    camera.distance = args.distance
    camera.lookat[:] = args.lookat
    lettering = np.flatnonzero(model.geom_matid == model.material("white").id)
    width, height = args.size
    for scale, suffix in ((1, ""), (2, "-2x")):
        size = (height * scale * OVERSAMPLE, width * scale * OVERSAMPLE)
        with mujoco.Renderer(model, *size) as renderer:
            tone, inside, lettered = render(renderer, data, camera, lettering)
        tone = unlettered(tone, inside, lettered, scale)
        # pinholes between parts would let the moon through
        inside = ~opened(~inside, 2 * scale + 1)
        shade, paper = printed(tone, inside, args, scale)
        save_plate(paper, PAPER, out / f"{args.name}-night{suffix}.png")
        save_plate(shade, SHADE, out / f"{args.name}-shade{suffix}.png")
        if scale == 1:
            facts = plate_facts(data, args, inside, paper)
            preview = np.empty((height, width, 3), np.uint8)
            preview[:] = SUMI
            preview[shade] = SHADE
            preview[paper] = PAPER
            Image.fromarray(preview, "RGB").save(out / f"{args.name}-preview.png")
    print("size      ", [width, height])
    for key, value in facts.items():
        print(f"{key:10}", value)


if __name__ == "__main__":
    main()
