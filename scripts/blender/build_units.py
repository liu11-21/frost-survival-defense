"""Build the stylized unit library used by allies and enemies.

The combat simulation still owns movement, targeting and hit timing. These
assets own only the authored silhouette and animation clips, so a missing or
invalid GLB can safely fall back to the existing pooled LiteHumanoid rig.
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import (  # noqa: E402
    add_simple_animation,
    add_lod_markers,
    assign_surface_variants,
    box,
    collision_box,
    cone,
    cylinder,
    empty,
    material,
    move_to,
    orient_for_babylon,
    parent_all,
    prism,
    reset_scene,
    save_source,
    sphere,
    torus,
    vertical_cylinder,
    export_glb,
)


# One shared palette family keeps allies warm and enemies cold-violet while
# each role gets a distinct silhouette and a functional prop.
UNITS = {
    "warrior": {"faction": "ally", "body": (0.78, 0.24, 0.12), "accent": (1.0, 0.68, 0.22), "crest": "helm", "weapon": "sword", "armor": "shoulders"},
    "shield": {"faction": "ally", "body": (0.2, 0.42, 0.58), "accent": (0.55, 0.9, 1.0), "crest": "greatHelm", "weapon": "club", "armor": "shield"},
    "archer": {"faction": "ally", "body": (0.22, 0.52, 0.28), "accent": (0.75, 1.0, 0.55), "crest": "hood", "weapon": "bow", "armor": "quiver"},
    "medic": {"faction": "ally", "body": (0.82, 0.84, 0.88), "accent": (0.35, 1.0, 0.68), "crest": "hood", "weapon": "cross", "armor": "medic"},
    "flagbearer": {"faction": "ally", "body": (0.72, 0.14, 0.1), "accent": (1.0, 0.74, 0.16), "crest": "crest", "weapon": "banner", "armor": "cape"},
    "mage": {"faction": "ally", "body": (0.28, 0.2, 0.62), "accent": (0.72, 0.38, 1.0), "crest": "hat", "weapon": "staff", "armor": "cape"},
    "assault": {"faction": "ally", "body": (0.16, 0.18, 0.24), "accent": (1.0, 0.25, 0.18), "crest": "visor", "weapon": "dagger", "armor": "lightArmor"},
    "engineer": {"faction": "ally", "body": (0.72, 0.38, 0.1), "accent": (1.0, 0.72, 0.18), "crest": "hardhat", "weapon": "wrench", "armor": "toolpack"},
    "musketeer": {"faction": "ally", "body": (0.2, 0.24, 0.34), "accent": (1.0, 0.76, 0.22), "crest": "tricorne", "weapon": "musket", "armor": "bandolier"},
    "frostmage": {"faction": "ally", "body": (0.3, 0.66, 0.82), "accent": (0.48, 0.95, 1.0), "crest": "iceCrown", "weapon": "iceStaff", "armor": "crystals"},
    "grunt": {"faction": "enemy", "body": (0.32, 0.18, 0.48), "accent": (0.72, 0.42, 1.0), "crest": "horn", "weapon": "club", "armor": "ragged"},
    "slinger": {"faction": "enemy", "body": (0.26, 0.28, 0.52), "accent": (0.42, 0.76, 1.0), "crest": "hood", "weapon": "sling", "armor": "pouch"},
    "bruiser": {"faction": "enemy", "body": (0.24, 0.2, 0.38), "accent": (0.78, 0.42, 1.0), "crest": "horn", "weapon": "shieldClub", "armor": "heavy"},
    "marksman": {"faction": "enemy", "body": (0.18, 0.34, 0.5), "accent": (0.42, 0.85, 1.0), "crest": "visor", "weapon": "bow", "armor": "cloak"},
    "juggernaut": {"faction": "enemy", "body": (0.18, 0.2, 0.28), "accent": (0.82, 0.42, 1.0), "crest": "greatHelm", "weapon": "shieldClub", "armor": "heavy"},
    "bombardier": {"faction": "enemy", "body": (0.44, 0.2, 0.5), "accent": (1.0, 0.36, 0.86), "crest": "hood", "weapon": "staff", "armor": "bombPack"},
    "boss": {"faction": "enemy", "body": (0.12, 0.26, 0.38), "accent": (0.35, 0.92, 1.0), "crest": "crown", "weapon": "club", "armor": "cape"},
    "breacher": {"faction": "enemy", "body": (0.3, 0.36, 0.46), "accent": (0.62, 0.88, 1.0), "crest": "greatHelm", "weapon": "ram", "armor": "batteringRam"},
    "icearmor": {"faction": "enemy", "body": (0.3, 0.62, 0.78), "accent": (0.66, 0.94, 1.0), "crest": "iceCrown", "weapon": "shieldClub", "armor": "iceArmor"},
    "commander": {"faction": "enemy", "body": (0.28, 0.18, 0.42), "accent": (1.0, 0.7, 0.24), "crest": "crown", "weapon": "banner", "armor": "cape"},
    "bomber": {"faction": "enemy", "body": (0.2, 0.52, 0.58), "accent": (0.52, 1.0, 1.0), "crest": "core", "weapon": "none", "armor": "bombPack"},
    "flyingMelee": {"faction": "enemy", "body": (0.28, 0.2, 0.48), "accent": (0.42, 0.9, 1.0), "crest": "horn", "weapon": "club", "armor": "wings"},
    "flyingEliteArcher": {"faction": "enemy", "body": (0.16, 0.34, 0.52), "accent": (0.4, 1.0, 1.0), "crest": "visor", "weapon": "bow", "armor": "wings"},
    "flyingBomber": {"faction": "enemy", "body": (0.44, 0.18, 0.52), "accent": (1.0, 0.35, 0.9), "crest": "core", "weapon": "staff", "armor": "wings"},
    "flyingColossus": {"faction": "enemy", "body": (0.12, 0.28, 0.4), "accent": (0.35, 0.96, 1.0), "crest": "crown", "weapon": "shieldClub", "armor": "wingsHeavy"},
}


def build_weapon(root, kind, mats, prefix):
    parts = []
    if kind in ("sword", "dagger"):
        blade_half = 0.28 if kind == "sword" else 0.18
        blade_tip = 0.42 if kind == "sword" else 0.28
        parts += [prism(f"{prefix}.blade", [(-0.07, -blade_half), (0.07, -blade_half), (0.09, blade_tip - 0.12), (0, blade_tip), (-0.09, blade_tip - 0.12)], 0.09, (0.0, 0.0, 0.08), mats["metal"], "LOD0", 0.012)]
        parts += [box(f"{prefix}.fuller", (0.035, blade_tip + blade_half - 0.1, 0.02), (0, (blade_tip - blade_half) * 0.5 - 0.02, 0.14), mats["accent"], "LOD0", 0.008)]
        parts += [cylinder(f"{prefix}.guard", 0.06, 0.46, (0, -0.32, 0), mats["accent"], "LOD0", 8)]
        parts += [box(f"{prefix}.grip", (0.1, 0.2, 0.1), (0, -0.5, 0), mats["leather"]), sphere(f"{prefix}.pommel", 0.075, (0, -0.62, 0), mats["glow"])]
    elif kind in ("club", "shieldClub"):
        parts += [cylinder(f"{prefix}.club", 0.72, 0.2, (0, 0, 0), mats["wood"], "LOD0", 7)]
        parts += [sphere(f"{prefix}.stud", 0.12, (0, 0.3, 0), mats["metal"])]
    elif kind == "bow":
        bow = torus(f"{prefix}.bow", 0.34, 0.045, (0, 0, 0), mats["wood"])
        bow.rotation_euler.x = math.pi * 0.5
        parts.append(bow)
        parts.append(box(f"{prefix}.string", (0.02, 0.62, 0.02), (0, 0, 0.02), mats["accent"]))
    elif kind == "staff":
        parts += [cylinder(f"{prefix}.shaft", 1.05, 0.055, (0, 0, 0), mats["wood"], "LOD0", 7)]
        parts += [sphere(f"{prefix}.orb", 0.16, (0, 0.56, 0), mats["glow"])]
        parts += [torus(f"{prefix}.ring", 0.2, 0.035, (0, 0.56, 0), mats["accent"])]
    elif kind == "iceStaff":
        parts += [cylinder(f"{prefix}.shaft", 1.15, 0.05, (0, 0, 0), mats["metal"], "LOD0", 6)]
        parts += [cylinder(f"{prefix}.crystal", 0.42, 0.22, (0, 0.62, 0), mats["ice"], "LOD0", 6)]
        parts += [sphere(f"{prefix}.core", 0.12, (0, 0.66, 0), mats["glow"])]
    elif kind == "musket":
        parts += [box(f"{prefix}.stock", (0.12, 0.18, 0.8), (0, -0.06, 0.28), mats["wood"])]
        parts += [cylinder(f"{prefix}.barrel", 1.0, 0.055, (0, 0.02, 0.76), mats["metal"], "LOD0", 7)]
        parts += [box(f"{prefix}.lock", (0.18, 0.16, 0.18), (0, 0.03, 0.1), mats["metal"])]
    elif kind == "wrench":
        parts += [cylinder(f"{prefix}.handle", 0.52, 0.07, (0, 0, 0), mats["metal"], "LOD0", 6)]
        parts += [torus(f"{prefix}.jaw", 0.13, 0.045, (0, 0.28, 0), mats["metal"])]
    elif kind == "banner":
        parts += [cylinder(f"{prefix}.pole", 1.45, 0.04, (0, 0.32, 0), mats["wood"], "LOD0", 6)]
        parts += [box(f"{prefix}.cloth", (0.5, 0.38, 0.035), (0.2, 0.7, 0), mats["accent"], "LOD0", 0.08)]
        parts += [sphere(f"{prefix}.finial", 0.1, (0, 1.08, 0), mats["glow"])]
    elif kind == "cross":
        parts += [box(f"{prefix}.vertical", (0.11, 0.42, 0.05), (0, 0, 0), mats["accent"]), box(f"{prefix}.horizontal", (0.34, 0.11, 0.05), (0, 0.06, 0), mats["accent"])]
    elif kind == "sling":
        parts += [torus(f"{prefix}.loop", 0.22, 0.035, (0, 0, 0), mats["leather"]), box(f"{prefix}.pouch", (0.24, 0.14, 0.2), (0, -0.1, 0), mats["leather"])]
    elif kind == "ram":
        parts += [cylinder(f"{prefix}.handle", 0.8, 0.12, (0, 0, 0), mats["wood"], "LOD0", 8), sphere(f"{prefix}.horn", 0.18, (0, 0.36, 0), mats["metal"])]
    return parts


def add_crest(root, kind, mats):
    parts = []
    if kind == "helm":
        parts += [sphere("crest.helm", 0.24, (0, 1.72, 0), mats["metal"]), box("crest.visor", (0.34, 0.08, 0.2), (0, 1.68, 0.18), mats["dark"])]
    elif kind == "greatHelm":
        parts += [sphere("crest.greatHelm", 0.3, (0, 1.7, 0), mats["metal"]), box("crest.faceplate", (0.42, 0.25, 0.1), (0, 1.66, 0.2), mats["dark"]), torus("crest.rim", 0.28, 0.035, (0, 1.72, 0), mats["accent"])]
    elif kind == "hood":
        parts += [sphere("crest.hood", 0.31, (0, 1.72, 0), mats["cloth"]), box("crest.shadow", (0.34, 0.12, 0.2), (0, 1.68, 0.18), mats["dark"])]
    elif kind in ("hat", "tricorne"):
        parts += [cylinder("crest.hat", 0.18, 0.48, (0, 1.92, 0), mats["cloth"], "LOD0", 7), box("crest.brim", (0.62, 0.08, 0.42), (0, 1.83, 0), mats["cloth"])]
        if kind == "tricorne": parts.append(box("crest.feather", (0.06, 0.34, 0.08), (0.2, 2.05, 0), mats["accent"], "LOD0", 0.08))
    elif kind in ("horn", "crown"):
        parts += [sphere("crest.crown", 0.28, (0, 1.72, 0), mats["metal"]), box("crest.hornL", (0.08, 0.3, 0.08), (-0.18, 1.98, 0), mats["accent"]), box("crest.hornR", (0.08, 0.3, 0.08), (0.18, 1.98, 0), mats["accent"])]
    elif kind == "visor":
        parts += [sphere("crest.mask", 0.27, (0, 1.72, 0), mats["dark"]), box("crest.lens", (0.34, 0.08, 0.06), (0, 1.72, 0.25), mats["glow"])]
    elif kind == "hardhat":
        parts += [sphere("crest.hardhat", 0.3, (0, 1.75, 0), mats["accent"]), torus("crest.hardhatRim", 0.3, 0.035, (0, 1.7, 0), mats["metal"])]
    elif kind == "iceCrown":
        parts += [sphere("crest.iceHead", 0.29, (0, 1.72, 0), mats["cloth"])]
        for i, x in enumerate((-0.18, 0, 0.18)):
            parts.append(box(f"crest.iceShard{i}", (0.08, 0.34, 0.08), (x, 1.98, 0), mats["ice"], "LOD0", 0.04))
    elif kind == "core":
        parts += [sphere("crest.core", 0.3, (0, 1.7, 0), mats["dark"]), sphere("crest.coreGlow", 0.14, (0, 1.7, 0.22), mats["glow"])]
    elif kind == "crest":
        parts += [sphere("crest.head", 0.29, (0, 1.72, 0), mats["cloth"]), box("crest.fin", (0.08, 0.3, 0.08), (0, 2.0, 0), mats["accent"])]
    return parts


def make_skeleton(root):
    """Create a small production-friendly segmented rig for the authored unit.

    The visible meshes are intentionally separate low-poly pieces. Binding each
    piece to a named bone keeps the assets inexpensive while still giving the
    GLB real pose animation instead of a root-only turntable clip.
    """
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    skeleton = bpy.context.object
    skeleton.name = "UnitSkeleton"
    skeleton.data.name = "UnitSkeleton"
    skeleton.parent = root
    skeleton.location = (0, 0, 0)
    armature = skeleton.data
    armature.edit_bones.remove(armature.edit_bones[0])
    specs = [
        ("root", (0, 0.0, 0), (0, 0.22, 0), None),
        ("pelvis", (0, 0.50, 0), (0, 0.76, 0), "root"),
        ("spine", (0, 0.76, 0), (0, 1.04, 0), "pelvis"),
        ("chest", (0, 1.04, 0), (0, 1.34, 0), "spine"),
        ("neck", (0, 1.42, 0), (0, 1.58, 0), "chest"),
        ("head", (0, 1.55, 0), (0, 1.82, 0), "neck"),
        ("upper_arm.L", (-0.28, 1.27, 0), (-0.50, 1.06, 0), "chest"),
        ("lower_arm.L", (-0.50, 1.06, 0), (-0.51, 0.84, 0), "upper_arm.L"),
        ("hand.L", (-0.51, 0.84, 0), (-0.51, 0.72, 0), "lower_arm.L"),
        ("upper_arm.R", (0.28, 1.27, 0), (0.50, 1.06, 0), "chest"),
        ("lower_arm.R", (0.50, 1.06, 0), (0.51, 0.84, 0), "upper_arm.R"),
        ("hand.R", (0.51, 0.84, 0), (0.51, 0.72, 0), "lower_arm.R"),
        ("thigh.L", (-0.13, 0.58, 0), (-0.13, 0.30, 0), "pelvis"),
        ("shin.L", (-0.13, 0.30, 0), (-0.13, 0.08, 0), "thigh.L"),
        ("foot.L", (-0.13, 0.08, 0), (-0.13, 0.02, 0.18), "shin.L"),
        ("thigh.R", (0.13, 0.58, 0), (0.13, 0.30, 0), "pelvis"),
        ("shin.R", (0.13, 0.30, 0), (0.13, 0.08, 0), "thigh.R"),
        ("foot.R", (0.13, 0.08, 0), (0.13, 0.02, 0.18), "shin.R"),
    ]
    for name, head, tail, parent_name in specs:
        bone = armature.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent_name:
            bone.parent = armature.edit_bones[parent_name]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    move_to(skeleton, "RIG")
    return skeleton


def bind_piece(obj, skeleton, bone_name):
    """Bone-parent a rigid low-poly piece without changing its rest pose."""
    world = obj.matrix_world.copy()
    obj.parent = skeleton
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def bone_for_piece(name):
    lower = name.lower()
    if lower.startswith(("arm.l", "armpanel.l", "wristband.l", "shoulder.l", "pauldron.l", "glove.l", "wing.-1")):
        return "upper_arm.L"
    if lower.startswith(("arm.r", "armpanel.r", "wristband.r", "shoulder.r", "pauldron.r", "glove.r", "wing.1")):
        return "upper_arm.R"
    if lower.startswith(("leg.l", "knee.l")):
        return "thigh.L"
    if lower.startswith(("leg.r", "knee.r")):
        return "thigh.R"
    if lower.startswith(("boot.l", "bootsolo.l")):
        return "foot.L"
    if lower.startswith(("boot.r", "bootsolo.r")):
        return "foot.R"
    if lower.startswith(("weapon.", "pouch", "banner.")):
        return "hand.R"
    if lower.startswith(("offhand.", "shield.")):
        return "hand.L"
    if lower.startswith(("head", "ear.", "crest.", "helmet", "face", "jaw", "heroeye", "herohood")):
        return "head"
    if lower.startswith(("torso", "belt", "cape", "pack", "medic", "chest", "ramframe", "ramtip", "core", "ice", "tool", "heroharness")):
        return "chest"
    if lower.startswith("wing."):
        return "chest"
    return "spine"


def add_unit_finish(parts, visual, cfg, mats, torso_width, heavy):
    """Add a shared finish layer without changing the rig contract.

    The base kit stays inexpensive, while this pass adds authored seams,
    cuffs, facial planes, boot contact and asymmetric hardware so the units
    read as constructed characters rather than a torso made from boxes.
    Every piece remains a separate rigid part and is bound by the existing
    segmented armature below.
    """
    shell = mats["metal"] if heavy else mats["accent"]
    parts += [
        prism(
            "torsoFrontShell",
            [(-torso_width * 0.48, 1.30), (torso_width * 0.48, 1.30), (torso_width * 0.39, 0.92), (0.10, 0.79), (-0.10, 0.79), (-torso_width * 0.39, 0.92)],
            0.10,
            (0, 0, 0.24),
            shell,
            "LOD0",
            0.025,
        ),
        prism("torsoBackYoke", [(-torso_width * 0.46, 1.28), (torso_width * 0.46, 1.28), (torso_width * 0.32, 1.02), (-torso_width * 0.32, 1.02)], 0.08, (0, 0, -0.20), mats["clothLight"], "LOD0", 0.018),
        prism(
            "collarFront",
            [(-0.22, 1.42), (0.22, 1.42), (0.16, 1.26), (0, 1.20), (-0.16, 1.26)],
            0.12,
            (0, 0, 0.20),
            shell,
            "LOD0",
            0.02,
        ),
        box("waistSash", (torso_width * 0.86, 0.065, 0.43), (0, 0.87, 0.20), mats["leatherLight"], "LOD0", 0.018),
        box("chestSeam", (0.045, 0.32, 0.035), (0, 1.02, 0.255), mats["highlight"], "LOD0", 0.012),
        prism("chinGuard", [(-0.14, 1.69), (0.14, 1.69), (0.10, 1.58), (-0.10, 1.58)], 0.11, (0, 0, 0.215), mats["dark"], "LOD0", 0.016),
        sphere("ear.L", 0.065, (-0.275, 1.70, 0.0), mats["skin"]),
        sphere("ear.R", 0.065, (0.275, 1.70, 0.0), mats["skin"]),
    ]
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        parts += [
            box(f"armPanel.{label}", (0.12, 0.34, 0.045), (side * 0.39, 1.12, 0.16), mats["clothLight"], "LOD0", 0.018),
            torus(f"wristBand.{label}", 0.105, 0.023, (side * 0.39, 0.84, 0.01), mats["metal"], "LOD0"),
            box(f"bootSole.{label}", (0.25, 0.06, 0.43), (side * 0.13, 0.035, 0.12), mats["dark"], "LOD0", 0.02),
            sphere(f"bootRivet.{label}", 0.035, (side * 0.13, 0.10, 0.25), mats["highlight"]),
        ]

    if cfg["faction"] == "ally":
        parts += [
            prism("allyShoulderTrim", [(-0.44, 1.40), (0.44, 1.40), (0.32, 1.32), (-0.32, 1.32)], 0.045, (0, 0, 0.17), mats["snow"], "LOD0", 0.012),
            box("allyBadge", (0.16, 0.16, 0.045), (0, 1.11, 0.30), mats["glow"], "LOD0", 0.018),
        ]
    else:
        parts += [
            prism("enemyShoulderTrim", [(-0.42, 1.38), (0.42, 1.38), (0.30, 1.26), (-0.30, 1.26)], 0.05, (0, 0, 0.16), mats["dark"], "LOD0", 0.014),
            sphere("enemyCoreStud", 0.07, (0, 1.11, 0.30), mats["glow"]),
        ]

    if cfg["weapon"] in ("sword", "dagger", "club", "shieldClub", "ram"):
        parts += [
            box("weaponWrapA", (0.11, 0.055, 0.12), (0.38, 0.69, 0.18), mats["leatherLight"], "LOD0", 0.012),
            box("weaponWrapB", (0.11, 0.055, 0.12), (0.38, 0.78, 0.18), mats["leatherLight"], "LOD0", 0.012),
        ]
    if cfg["armor"] in ("heavy", "iceArmor", "wingsHeavy"):
        for side in (-1, 1):
            label = "L" if side < 0 else "R"
            parts.append(cone(f"shoulderSpike.{label}", 0.075, 0.018, 0.23, (side * 0.42, 1.50, 0.04), mats["accent"], "LOD0", 6))

    if cfg["armor"] in ("wings", "wingsHeavy"):
        # Layered membrane panels replace the flat bar read for every flying
        # unit, not only the colossus.
        for side in (-1, 1):
            for index, scale in enumerate((0.72, 0.54, 0.36)):
                points = [(0.0, 1.46), (0.34 * scale, 1.35), (0.52 * scale, 1.10), (0.18 * scale, 1.17)]
                mirrored = [(x * side, y) for x, y in points]
                parts.append(prism(f"wing.{side}.panel{index}", mirrored, 0.045, (0, 0, -0.15 - index * 0.03), mats["ice" if index else "cloth"], "LOD0", 0.012))
            parts.append(sphere(f"wing.{side}.joint", 0.09, (side * 0.36, 1.27, -0.12), mats["metal"]))


def add_bodycraft_finish(parts, visual, cfg, mats, torso_width, heavy):
    """Add a second construction pass to the shared body without recolouring it.

    The first authored pass gave every roster entry a common silhouette and a
    role kit.  This pass makes the body read as assembled clothing and armour
    at the game's normal camera distance: inset chest panels, side seams,
    articulated cuffs, face sockets, fasteners and layered hem pieces.  The
    parts stay rigid and are bound by ``bone_for_piece`` below, so this is a
    visual upgrade rather than a new gameplay rig.
    """
    shell = mats["metal"] if heavy else mats["accent"]
    front = 0.28
    back = -0.22
    # Angular inset panels break the broad torso box into a fitted garment or
    # breastplate.  The two panels intentionally leave a centre seam visible.
    parts += [
        prism(
            "torsoPanel.L",
            [(-torso_width * 0.44, 1.28), (-0.05, 1.28), (-0.08, 0.92), (-torso_width * 0.34, 0.86)],
            0.065,
            (0, 0, front + 0.035),
            shell,
            "LOD0",
            0.014,
        ),
        prism(
            "torsoPanel.R",
            [(0.05, 1.28), (torso_width * 0.44, 1.28), (torso_width * 0.34, 0.86), (0.08, 0.92)],
            0.065,
            (0, 0, front + 0.035),
            shell,
            "LOD0",
            0.014,
        ),
        box("torsoSeam.vertical", (0.028, 0.33, 0.035), (0, 1.10, front + 0.075), mats["highlight"], "LOD0", 0.008),
        box("torsoSeam.waist", (torso_width * 0.72, 0.028, 0.035), (0, 0.90, front + 0.075), mats["leatherLight"], "LOD0", 0.008),
        box("backSeam", (torso_width * 0.58, 0.035, 0.03), (0, 1.03, back - 0.035), mats["dark"], "LOD0", 0.008),
    ]

    # Face planes and eye sockets are deliberately small; they catch the key
    # light and give the roster personality without requiring texture maps.
    parts += [
        torus("faceSocket.L", 0.073, 0.014, (-0.092, 1.765, 0.274), mats["dark"], "LOD0"),
        torus("faceSocket.R", 0.073, 0.014, (0.092, 1.765, 0.274), mats["dark"], "LOD0"),
        sphere("faceIris.L", 0.024, (-0.092, 1.765, 0.292), mats["glow"]),
        sphere("faceIris.R", 0.024, (0.092, 1.765, 0.292), mats["glow"]),
        prism("faceNoseBridge", [(-0.035, 1.80), (0.035, 1.80), (0.025, 1.64), (-0.025, 1.64)], 0.045, (0, 0, 0.285), mats["skin"], "LOD0", 0.008),
        box("faceMouthPlate", (0.13, 0.028, 0.025), (0, 1.625, 0.286), mats["dark"], "LOD0", 0.006),
    ]

    # Separate cuffs, straps and fasteners make the limbs feel constructed and
    # also provide an intentional material break for the game camera.
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        parts += [
            box(f"arm.{label}.cuff", (0.19, 0.10, 0.22), (side * 0.39, 0.82, 0.02), mats["leatherLight"], "LOD0", 0.018),
            sphere(f"arm.{label}.fastener", 0.035, (side * 0.39, 0.84, 0.145), mats["highlight"]),
            box(f"leg.{label}.shinPlate", (0.19, 0.30, 0.045), (side * 0.13, 0.36, 0.135), shell, "LOD0", 0.016),
            box(f"boot.{label}.buckle", (0.18, 0.065, 0.045), (side * 0.13, 0.12, 0.245), mats["metalLight"], "LOD0", 0.01),
        ]

    # Fitted waist hardware and a small asymmetrical utility pouch avoid the
    # mirrored mannequin look while remaining inexpensive at LOD0.
    parts += [
        box("waistFrontPlate", (0.22, 0.18, 0.055), (0, 0.83, front + 0.04), mats["metalLight"], "LOD0", 0.016),
        sphere("waistFrontGem", 0.043, (0, 0.83, front + 0.08), mats["glow"]),
        prism("utilityPouch", [(-0.12, 0.84), (0.12, 0.84), (0.10, 0.67), (-0.10, 0.67)], 0.14, (torso_width * 0.54, 0, 0.01), mats["leather"], "LOD0", 0.016),
        box("utilityPouchFlap", (0.20, 0.035, 0.15), (torso_width * 0.54, 0.83, 0.09), mats["accent"], "LOD0", 0.01),
    ]

    if cfg["faction"] == "ally":
        parts += [
            prism("allyCollarTab", [(-0.10, 1.42), (0.10, 1.42), (0.08, 1.26), (-0.08, 1.26)], 0.055, (0, 0, front + 0.04), mats["snow"], "LOD0", 0.012),
            sphere("allyCollarStud", 0.035, (0, 1.34, front + 0.09), mats["glow"]),
        ]
    else:
        parts += [
            prism("enemyCollarTab", [(-0.12, 1.42), (0.12, 1.42), (0.09, 1.24), (-0.09, 1.24)], 0.06, (0, 0, front + 0.04), mats["dark"], "LOD0", 0.012),
            sphere("enemyCollarStud", 0.04, (0, 1.33, front + 0.09), mats["glow"]),
        ]


def add_role_finish(parts, visual, cfg, mats, torso_width, heavy):
    """Give every roster entry a bespoke focal kit beyond the shared body.

    The first authored pass established the common rig and material language.
    These role kits are intentionally small, but they add the visual anchors
    that make a unit identifiable at gameplay scale: straps, clasps, lenses,
    tools, ammunition, wing harnesses and faction-specific armour breaks.
    They are rigid pieces bound by the existing skeleton, so the gameplay
    animation and GLB contract remain unchanged.
    """
    ally = cfg["faction"] == "ally"
    edge = mats["metalLight"] if ally else mats["metal"]
    dark = mats["dark"]

    if visual == "shield":
        parts += [
            sphere("shieldBoss", 0.12, (-0.50, 0.90, 0.16), mats["glow"]),
            box("shieldHandle", (0.08, 0.42, 0.08), (-0.50, 0.90, -0.08), dark, "LOD0", 0.018),
            prism("shieldChevron", [(-0.18, 1.08), (0.0, 0.72), (0.18, 1.08), (0.12, 1.18), (0, 0.90), (-0.12, 1.18)], 0.035, (-0.50, 0, 0.16), mats["highlight"], "LOD0", 0.012),
            torus("shieldStrap", 0.23, 0.025, (-0.50, 0.90, -0.12), edge, "LOD0"),
        ]
    elif visual == "archer":
        parts += [
            torus("arm.L.bracer", 0.13, 0.035, (-0.42, 0.98, 0.16), edge, "LOD0"),
            torus("arm.R.bracer", 0.13, 0.035, (0.42, 0.98, 0.16), edge, "LOD0"),
            box("quiverCap", (0.24, 0.08, 0.22), (-0.22, 1.40, -0.23), mats["metalLight"], "LOD0", 0.02),
            *(cone(f"arrowHead.{i}", 0.035, 0.005, 0.22, (-0.22 + i * 0.06, 1.56, -0.23), mats["metalLight"], "LOD0", 5) for i in range(3)),
            sphere("bowGripGem", 0.05, (0.0, 0.0, 0.05), mats["glow"]),
        ]
    elif visual == "medic":
        parts += [
            prism("medicSatchelFlap", [(-0.26, 1.22), (0.26, 1.22), (0.20, 0.90), (-0.20, 0.90)], 0.08, (0, 0, -0.33), mats["clothLight"], "LOD0", 0.02),
            torus("medicSatchelSeal", 0.10, 0.028, (0, 1.08, -0.38), mats["glow"], "LOD0"),
            cylinder("medicVial.L", 0.045, 0.20, (-0.34, 0.94, 0.18), mats["ice"], "LOD0", 6),
            cylinder("medicVial.R", 0.045, 0.20, (0.34, 0.94, 0.18), mats["glow"], "LOD0", 6),
        ]
    elif visual == "flagbearer":
        parts += [
            torus("bannerHarness", 0.25, 0.03, (0.28, 1.10, 0.06), edge, "LOD0"),
            box("bannerClasp", (0.16, 0.12, 0.08), (0.28, 1.02, 0.22), mats["metalLight"], "LOD0", 0.018),
            prism("bannerChevron", [(-0.20, 0.82), (0.18, 0.88), (0.04, 0.50), (-0.22, 0.62)], 0.035, (0.2, 0.7, 0.02), mats["highlight"], "LOD0", 0.01),
            torus("bannerPoleBand", 0.07, 0.025, (0.0, 0.54, 0.0), mats["metalLight"], "LOD0"),
        ]
    elif visual == "mage":
        parts += [
            prism("mageRobePanel", [(-0.42, 1.02), (0.42, 1.02), (0.58, 0.42), (0.0, 0.24), (-0.58, 0.42)], 0.06, (0, 0, -0.05), mats["clothLight"], "LOD0", 0.026),
            torus("mageRuneBelt", 0.32, 0.028, (0, 0.90, 0.19), mats["accent"], "LOD0"),
            cone("mageHatTip", 0.16, 0.025, 0.46, (0.0, 2.16, 0.0), mats["cloth"], "LOD0", 7),
            sphere("mageFocusGem", 0.075, (0, 1.38, 0.25), mats["glow"]),
        ]
    elif visual == "assault":
        parts += [
            prism("assaultChestRig", [(-0.30, 1.34), (0.30, 1.34), (0.24, 1.00), (-0.24, 1.00)], 0.10, (0, 0, 0.28), mats["dark"], "LOD0", 0.02),
            box("assaultHarness", (0.08, 0.62, 0.05), (-0.24, 1.08, 0.31), mats["accent"], "LOD0", 0.015),
            box("assaultHarnessR", (0.08, 0.62, 0.05), (0.24, 1.08, 0.31), mats["accent"], "LOD0", 0.015),
            torus("assaultVisorRing", 0.22, 0.028, (0, 1.72, 0.26), mats["glow"], "LOD0"),
            box("assaultDaggerSheath", (0.12, 0.46, 0.10), (0.32, 0.84, -0.22), mats["leatherLight"], "LOD0", 0.02),
        ]
    elif visual == "engineer":
        parts += [
            torus("engineerHelmetBand", 0.30, 0.035, (0, 1.76, 0), mats["metalLight"], "LOD0"),
            box("engineerGoggle.L", (0.12, 0.07, 0.06), (-0.10, 1.75, 0.25), mats["glass"], "LOD0", 0.012),
            box("engineerGoggle.R", (0.12, 0.07, 0.06), (0.10, 1.75, 0.25), mats["glass"], "LOD0", 0.012),
            torus("engineerToolBelt", 0.34, 0.035, (0, 0.86, 0.18), mats["metalLight"], "LOD0"),
            box("engineerBlueprint", (0.24, 0.30, 0.025), (-0.30, 1.02, 0.20), mats["ice"], "LOD0", 0.008),
            sphere("engineerBadge", 0.07, (0.30, 1.02, 0.23), mats["glow"]),
        ]
    elif visual == "musketeer":
        parts += [
            prism("musketeerLapel.L", [(-0.18, 1.40), (-0.04, 1.34), (-0.08, 0.96), (-0.24, 1.08)], 0.07, (-0.12, 0, 0.25), mats["accent"], "LOD0", 0.016),
            prism("musketeerLapel.R", [(0.18, 1.40), (0.04, 1.34), (0.08, 0.96), (0.24, 1.08)], 0.07, (0.12, 0, 0.25), mats["accent"], "LOD0", 0.016),
            box("musketeerHatBand", (0.48, 0.07, 0.36), (0, 1.86, 0), mats["metalLight"], "LOD0", 0.014),
            prism("musketeerFeather", [(-0.04, 2.02), (0.06, 2.32), (0.14, 2.03), (0.06, 1.96)], 0.05, (0.20, 0, 0.02), mats["highlight"], "LOD0", 0.012),
            box("musketeerBayonet", (0.035, 0.08, 0.68), (0.0, 0.02, 1.10), mats["metalLight"], "LOD0", 0.008),
            *(sphere(f"musketeerAmmo.{i}", 0.055, (-0.22 + i * 0.12, 1.08 - i * 0.04, 0.22), mats["gold"]) for i in range(4)),
        ]
    elif visual == "frostmage":
        parts += [
            prism("frostMantle", [(-0.48, 1.42), (0.48, 1.42), (0.66, 0.90), (0.0, 0.70), (-0.66, 0.90)], 0.07, (0, 0, -0.18), mats["ice"], "LOD0", 0.022),
            torus("frostHalo", 0.34, 0.035, (0, 1.76, -0.05), mats["ice"], "LOD0"),
            *(cone(f"frostIcicle.{i}", 0.07, 0.01, 0.32, (-0.24 + i * 0.16, 0.72, 0.02), mats["ice"], "LOD0", 6) for i in range(4)),
            sphere("frostCoreBadge", 0.08, (0, 1.12, 0.30), mats["glow"]),
        ]
    elif visual == "grunt":
        parts += [
            cone("gruntTusk.L", 0.08, 0.015, 0.24, (-0.18, 1.58, 0.24), mats["metalLight"], "LOD0", 6),
            cone("gruntTusk.R", 0.08, 0.015, 0.24, (0.18, 1.58, 0.24), mats["metalLight"], "LOD0", 6),
            torus("gruntNeckRing", 0.24, 0.035, (0, 1.40, 0.02), mats["accent"], "LOD0"),
            box("gruntBeltPouch", (0.20, 0.28, 0.18), (0.28, 0.84, 0.20), mats["leatherLight"], "LOD0", 0.02),
        ]
    elif visual == "slinger":
        parts += [
            prism("slingerFaceMask", [(-0.22, 1.78), (0.22, 1.78), (0.16, 1.61), (-0.16, 1.61)], 0.08, (0, 0, 0.25), mats["dark"], "LOD0", 0.018),
            box("slingerShoulderSash", (0.08, 0.70, 0.06), (-0.28, 1.15, 0.16), mats["accent"], "LOD0", 0.015),
            torus("slingerPouchRing", 0.13, 0.035, (0.27, 0.87, 0.22), mats["metal"], "LOD0"),
            *(sphere(f"slingerStone.{i}", 0.055, (0.18 + i * 0.08, 0.90, 0.23), mats["ice"]) for i in range(3)),
        ]
    elif visual == "bruiser":
        parts += [
            prism("bruiserBellyPlate", [(-0.36, 1.30), (0.36, 1.30), (0.30, 0.78), (-0.30, 0.78)], 0.13, (0, 0, 0.30), mats["metal"], "LOD0", 0.03),
            torus("bruiserChain", 0.32, 0.035, (0, 0.82, 0.26), mats["metalLight"], "LOD0"),
            sphere("bruiserFist.L", 0.14, (-0.54, 0.70, 0.18), mats["metal"]),
            sphere("bruiserFist.R", 0.14, (0.54, 0.70, 0.18), mats["metal"]),
        ]
    elif visual == "marksman":
        parts += [
            prism("marksmanHoodPeak", [(-0.24, 1.88), (0.24, 1.88), (0.0, 2.16)], 0.08, (0, 0, -0.03), mats["cloth"], "LOD0", 0.018),
            box("marksmanCloakClasp", (0.18, 0.10, 0.08), (0, 1.37, 0.27), mats["metalLight"], "LOD0", 0.014),
            box("marksmanQuiverBand", (0.28, 0.07, 0.24), (-0.22, 1.10, -0.24), mats["metal"], "LOD0", 0.015),
            *(cone(f"marksmanArrow.{i}", 0.025, 0.005, 0.30, (-0.22 + i * 0.06, 1.48, -0.24), mats["ice"], "LOD0", 5) for i in range(3)),
        ]
    elif visual == "juggernaut":
        parts += [
            prism("juggernautSiegePlate", [(-0.48, 1.46), (0.48, 1.46), (0.40, 0.74), (0, 0.60), (-0.40, 0.74)], 0.18, (0, 0, 0.28), mats["metal"], "LOD0", 0.035),
            *(sphere(f"juggernautRivet.{i}", 0.045, (-0.28 + i * 0.18, 1.22, 0.39), mats["accent"]) for i in range(4)),
            cone("juggernautCrest", 0.16, 0.02, 0.38, (0, 2.02, 0.0), mats["accent"], "LOD0", 6),
            box("juggernautKneeBar", (0.62, 0.08, 0.12), (0, 0.27, 0.20), mats["metalLight"], "LOD0", 0.015),
        ]
    elif visual == "bombardier":
        parts += [
            *(sphere(f"bombardierShell.{i}", 0.12, (-0.24 + i * 0.24, 1.08, -0.30), mats["accent"]) for i in range(3)),
            box("bombardierFuseBox", (0.28, 0.18, 0.20), (0.34, 0.90, 0.22), dark, "LOD0", 0.02),
            torus("bombardierFuse", 0.09, 0.022, (0.34, 1.05, 0.25), mats["glow"], "LOD0"),
            prism("bombardierApron", [(-0.34, 1.10), (0.34, 1.10), (0.42, 0.58), (-0.42, 0.58)], 0.06, (0, 0, -0.28), mats["clothLight"], "LOD0", 0.022),
        ]
    elif visual == "boss":
        parts += [
            torus("bossCrownRing", 0.34, 0.045, (0, 1.82, 0.02), mats["metalLight"], "LOD0"),
            sphere("bossCrownGem", 0.09, (0, 2.02, 0.06), mats["glow"]),
            prism("bossMantle", [(-0.58, 1.48), (0.58, 1.48), (0.78, 0.72), (0, 0.56), (-0.78, 0.72)], 0.09, (0, 0, -0.20), mats["clothLight"], "LOD0", 0.03),
            box("bossWarBelt", (0.92, 0.10, 0.10), (0, 0.82, 0.32), mats["gold"], "LOD0", 0.02),
        ]
    elif visual == "breacher":
        parts += [
            prism("breacherRamHarness", [(-0.42, 1.30), (0.42, 1.30), (0.30, 0.90), (-0.30, 0.90)], 0.10, (0, 0, 0.28), mats["metal"], "LOD0", 0.028),
            torus("breacherRamCollar", 0.30, 0.04, (0, 1.36, 0.02), mats["metalLight"], "LOD0"),
            *(sphere(f"breacherBolt.{i}", 0.055, (-0.26 + i * 0.17, 1.14, 0.36), mats["accent"]) for i in range(4)),
            cone("breacherCrest", 0.14, 0.02, 0.34, (0, 2.02, 0.06), mats["metalLight"], "LOD0", 6),
        ]
    elif visual == "icearmor":
        parts += [
            prism("icearmorChestPlate", [(-0.42, 1.44), (0.42, 1.44), (0.34, 0.76), (0, 0.64), (-0.34, 0.76)], 0.16, (0, 0, 0.28), mats["ice"], "LOD0", 0.03),
            *(cone(f"icearmorSpike.{i}", 0.10, 0.015, 0.42, (-0.30 + i * 0.20, 1.48, 0.12), mats["ice"], "LOD0", 6) for i in range(4)),
            torus("icearmorCoreRing", 0.16, 0.03, (0, 1.10, 0.37), mats["glow"], "LOD0"),
        ]
    elif visual == "commander":
        parts += [
            prism("commanderSash", [(-0.16, 1.38), (0.10, 1.34), (0.36, 0.58), (0.12, 0.54)], 0.06, (0, 0, 0.28), mats["gold"], "LOD0", 0.016),
            torus("commanderEpaulet.L", 0.16, 0.035, (-0.38, 1.40, 0), mats["gold"], "LOD0"),
            torus("commanderEpaulet.R", 0.16, 0.035, (0.38, 1.40, 0), mats["gold"], "LOD0"),
            box("commanderMedal", (0.15, 0.15, 0.05), (0, 1.12, 0.34), mats["glow"], "LOD0", 0.018),
        ]
    elif visual == "bomber":
        parts += [
            torus("bomberCoreCage", 0.28, 0.035, (0, 1.0, 0.26), mats["metalLight"], "LOD0"),
            *(sphere(f"bomberBombPod.{i}", 0.13, (-0.34 + i * 0.34, 0.78, -0.28), mats["accent"]) for i in range(3)),
            prism("bomberFin", [(-0.10, 1.24), (0.10, 1.24), (0.18, 1.62), (0, 1.48), (-0.18, 1.62)], 0.05, (0, 0, -0.02), mats["ice"], "LOD0", 0.016),
        ]
    elif visual in ("flyingMelee", "flyingEliteArcher", "flyingBomber", "flyingColossus"):
        parts += [
            torus("flightHarness", 0.34 if not heavy else 0.48, 0.04, (0, 1.02, -0.12), mats["metalLight"], "LOD0"),
            box("flightSaddle", (0.42 if not heavy else 0.62, 0.12, 0.30), (0, 1.10, -0.18), mats["leatherLight"], "LOD0", 0.02),
            *(cone(f"flightTalons.{side}", 0.08, 0.01, 0.30, (side * 0.34, 0.26, 0.22), mats["metalLight"], "LOD0", 6) for side in (-1, 1)),
        ]
        if visual == "flyingEliteArcher":
            parts += [
                torus("flightArcherBracer", 0.13, 0.03, (-0.44, 0.98, 0.16), mats["ice"], "LOD0"),
                *(cone(f"flightArrow.{i}", 0.025, 0.005, 0.30, (-0.22 + i * 0.06, 1.48, -0.24), mats["ice"], "LOD0", 5) for i in range(3)),
            ]
        elif visual == "flyingBomber":
            parts += [
                *(sphere(f"flightBombPod.{i}", 0.13, (-0.34 + i * 0.34, 0.78, -0.30), mats["accent"]) for i in range(3)),
                torus("flightFuse", 0.08, 0.022, (0, 1.10, 0.28), mats["glow"], "LOD0"),
            ]


def bind_unit_pieces(parts, skeleton):
    for obj in parts:
        bind_piece(obj, skeleton, bone_for_piece(obj.name))


def add_armature_clip(skeleton, name, end, poses):
    """Add a named NLA clip to the segmented armature."""
    if not skeleton.animation_data:
        skeleton.animation_data_create()
    skeleton.animation_data.action = None
    for pose_bone in skeleton.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0, 0, 0)
        pose_bone.location = (0, 0, 0)
    for frame, pose in poses:
        bpy.context.scene.frame_set(frame)
        for bone_name, rotation in pose.items():
            pose_bone = skeleton.pose.bones.get(bone_name)
            if not pose_bone:
                continue
            pose_bone.rotation_euler = rotation
            pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    action = skeleton.animation_data.action
    if action is None:
        raise RuntimeError(f"Blender did not create an armature Action for {skeleton.name}:{name}")
    action.name = name
    track = skeleton.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = end
    skeleton.animation_data.action = None


def build_unit(visual, cfg):
    reset_scene()
    body_color = cfg["body"]
    accent_color = cfg["accent"]
    mats = {
        "cloth": material(f"MAT_{visual}_cloth", body_color, 0.86),
        "leather": material(f"MAT_{visual}_leather", tuple(max(0.02, c * 0.52) for c in body_color), 0.9),
        "metal": material(f"MAT_{visual}_metal", (0.34, 0.4, 0.5), 0.3, 0.85),
        "metalLight": material(f"MAT_{visual}_metalLight", (0.56, 0.66, 0.78), 0.2, 0.9),
        "skin": material(f"MAT_{visual}_skin", (0.62, 0.38, 0.28) if cfg["faction"] == "enemy" else (0.78, 0.58, 0.42), 0.78),
        "accent": material(f"MAT_{visual}_accent", accent_color, 0.42, 0.35),
        "highlight": material(f"MAT_{visual}_highlight", tuple(min(1.0, c * 1.18 + 0.08) for c in accent_color), 0.34, 0.4),
        "clothLight": material(f"MAT_{visual}_clothLight", tuple(min(1.0, c * 1.18 + 0.05) for c in body_color), 0.82),
        "leatherLight": material(f"MAT_{visual}_leatherLight", tuple(min(1.0, c * 0.78 + 0.08) for c in body_color), 0.76),
        "snow": material(f"MAT_{visual}_snow", (0.78, 0.90, 0.98), 0.72),
        "glow": material(f"MAT_{visual}_glow", accent_color, 0.25, 0.0, accent_color),
        "ice": material(f"MAT_{visual}_ice", (0.55, 0.86, 1.0), 0.24, 0.15, (0.25, 0.7, 1.0)),
        "glass": material(f"MAT_{visual}_glass", (0.18, 0.58, 0.9), 0.12, 0.12, (0.08, 0.32, 0.75)),
        "gold": material(f"MAT_{visual}_gold", (1.0, 0.55, 0.08), 0.24, 0.78, (0.8, 0.25, 0.03)),
        "wood": material(f"MAT_{visual}_wood", (0.38, 0.2, 0.1), 0.86),
        "dark": material(f"MAT_{visual}_dark", (0.045, 0.05, 0.08), 0.62, 0.35),
    }
    root = orient_for_babylon(empty("UnitRoot", target="EXPORT", display="CUBE"))
    add_lod_markers(root, "character")
    parts = []
    heavy = cfg["armor"] in ("heavy", "iceArmor", "batteringRam", "wingsHeavy")
    torso_width = 0.54 if heavy else 0.46
    parts += [box("torso", (torso_width, 0.62, 0.34), (0, 0.98, 0), mats["cloth"])]
    # Layered cloth, leather and metal keep the silhouette readable at the
    # game's normal zoom instead of looking like a single coloured primitive.
    parts += [
        box("tunicHem", (torso_width * 1.05, 0.14, 0.38), (0, 0.69, 0), mats["leather"], bevel=0.05),
        box("belt", (torso_width * 1.08, 0.09, 0.4), (0, 0.78, 0.01), mats["accent"], bevel=0.035),
        box("beltBuckle", (0.12, 0.12, 0.06), (0, 0.78, 0.22), mats["metal"], bevel=0.025),
        box("chestPanel", (torso_width * 0.72, 0.28, 0.07), (0, 1.05, 0.19), mats["accent"], bevel=0.035),
        vertical_cylinder("neckGuard", 0.12, 0.16, (0, 1.38, 0), mats["leather"], "LOD0", 8),
        sphere("head", 0.28, (0, 1.7, 0), mats["skin"]),
        box("faceStripe", (0.2, 0.06, 0.035), (0, 1.71, 0.25), mats["accent"], bevel=0.02),
        sphere("head.eye.L", 0.038, (-0.085, 1.75, 0.268), mats["glow"]),
        sphere("head.eye.R", 0.038, (0.085, 1.75, 0.268), mats["glow"]),
    ]
    parts += [
        box("leg.L", (0.18, 0.55, 0.2), (-0.13, 0.38, 0), mats["leather"], bevel=0.045),
        box("leg.R", (0.18, 0.55, 0.2), (0.13, 0.38, 0), mats["leather"], bevel=0.045),
        box("knee.L", (0.2, 0.16, 0.22), (-0.13, 0.27, 0.08), mats["accent"], bevel=0.035),
        box("knee.R", (0.2, 0.16, 0.22), (0.13, 0.27, 0.08), mats["accent"], bevel=0.035),
        box("boot.L", (0.22, 0.12, 0.38), (-0.13, 0.08, 0.08), mats["dark"], bevel=0.045),
        box("boot.R", (0.22, 0.12, 0.38), (0.13, 0.08, 0.08), mats["dark"], bevel=0.045),
        box("arm.L", (0.17, 0.58, 0.18), (-0.38, 1.02, 0), mats["cloth"], bevel=0.045),
        box("arm.R", (0.17, 0.58, 0.18), (0.38, 1.02, 0), mats["cloth"], bevel=0.045),
        sphere("glove.L", 0.11, (-0.38, 0.72, 0.02), mats["skin"]),
        sphere("glove.R", 0.11, (0.38, 0.72, 0.02), mats["skin"]),
        box("shoulder.L", (0.27, 0.17, 0.3), (-0.34, 1.28, 0), mats["accent"], bevel=0.06),
        box("shoulder.R", (0.27, 0.17, 0.3), (0.34, 1.28, 0), mats["accent"], bevel=0.06),
    ]
    # Shared hero-quality silhouette pass.  These are small authored panels
    # and caps rather than extra colour swaps: they give every role a readable
    # front plane, a waist break and a believable boot contact in the normal
    # isometric camera.
    shell_mat = mats["metal"] if heavy else mats["accent"]
    parts += [
        prism(
            "torsoShell",
            [(-torso_width * 0.46, 1.28), (torso_width * 0.46, 1.28), (torso_width * 0.38, 0.86), (0, 0.78), (-torso_width * 0.38, 0.86)],
            0.11,
            (0, 0, 0.19),
            shell_mat,
            "LOD0",
            0.025,
        ),
        prism("helmetBrow", [(-0.2, 1.83), (0.2, 1.83), (0.15, 1.69), (-0.15, 1.69)], 0.22, (0, 0, 0.2), mats["dark"], "LOD0", 0.02),
        prism("bootToe.L", [(-0.12, 0.16), (0.08, 0.16), (0.1, 0.03), (-0.12, 0.03)], 0.28, (-0.13, 0, 0.15), mats["dark"], "LOD0", 0.018),
        prism("bootToe.R", [(-0.08, 0.16), (0.12, 0.16), (0.12, 0.03), (-0.1, 0.03)], 0.28, (0.13, 0, 0.15), mats["dark"], "LOD0", 0.018),
    ]
    for side in (-1, 1):
        shoulder_cap = cone(f"shoulderCap.{side}", 0.19 if heavy else 0.16, 0.1, 0.18, (side * 0.37, 1.37, 0), mats["metal"], "LOD0", 6)
        shoulder_cap.rotation_euler.x = math.pi * 0.5
        parts.append(shoulder_cap)
    parts += add_crest(root, cfg["crest"], mats)
    parts += build_weapon(root, cfg["weapon"], mats, "weapon")
    # The warrior is the reference melee silhouette: layered breastplate,
    # raised shoulder guards and a scabbard give it a fitted armour read rather
    # than the shared tunic reading as a coloured block.
    if visual == "warrior":
        parts += [
            prism("warriorBreastplate", [(-0.24, 1.34), (0.24, 1.34), (0.2, 0.94), (0, 0.84), (-0.2, 0.94)], 0.13, (0, 0, 0.25), mats["metal"], "LOD0", 0.025),
            prism("warriorCollar", [(-0.26, 1.38), (0.26, 1.38), (0.18, 1.5), (-0.18, 1.5)], 0.1, (0, 0, 0.08), mats["accent"], "LOD0", 0.018),
            prism("warriorShoulder.L", [(-0.2, 1.42), (0.02, 1.5), (0.12, 1.28), (-0.2, 1.22)], 0.18, (-0.36, 0, 0), mats["metal"], "LOD0", 0.02),
            prism("warriorShoulder.R", [(-0.02, 1.5), (0.2, 1.42), (0.2, 1.22), (-0.12, 1.28)], 0.18, (0.36, 0, 0), mats["metal"], "LOD0", 0.02),
            torus("warriorChestSeal", 0.1, 0.025, (0, 1.12, 0.34), mats["glow"], "LOD0"),
            box("warriorScabbard", (0.1, 0.72, 0.12), (-0.28, 1.02, -0.22), mats["leather"], "LOD0", 0.025),
            box("warriorScabbardCap", (0.14, 0.08, 0.16), (-0.28, 0.66, -0.22), mats["metal"], "LOD0", 0.018),
            prism("warriorAbdomen", [(-0.18, 1.03), (0.18, 1.03), (0.14, 0.82), (0, 0.76), (-0.14, 0.82)], 0.12, (0, 0, 0.24), mats["metalLight"], "LOD0", 0.022),
            prism("warriorHipGuard.L", [(-0.16, 0.88), (0.04, 0.88), (0.12, 0.62), (-0.10, 0.66)], 0.11, (-0.34, 0, 0.12), mats["metal"], "LOD0", 0.02),
            prism("warriorHipGuard.R", [(-0.04, 0.88), (0.16, 0.88), (0.10, 0.66), (-0.12, 0.62)], 0.11, (0.34, 0, 0.12), mats["metal"], "LOD0", 0.02),
            sphere("warriorRivet.L", 0.045, (-0.20, 1.18, 0.35), mats["highlight"]),
            sphere("warriorRivet.R", 0.045, (0.20, 1.18, 0.35), mats["highlight"]),
            torus("warriorCollarRing", 0.22, 0.028, (0, 1.43, 0.16), mats["metalLight"], "LOD0"),
            box("warriorShoulderStrap.L", (0.07, 0.34, 0.06), (-0.38, 1.40, 0.18), mats["leatherLight"], "LOD0", 0.012),
            box("warriorShoulderStrap.R", (0.07, 0.34, 0.06), (0.38, 1.40, 0.18), mats["leatherLight"], "LOD0", 0.012),
            box("warriorKneeBand.L", (0.22, 0.06, 0.24), (-0.13, 0.38, 0.16), mats["metalLight"], "LOD0", 0.012),
            box("warriorKneeBand.R", (0.22, 0.06, 0.24), (0.13, 0.38, 0.16), mats["metalLight"], "LOD0", 0.012),
            sphere("warriorPommelGem", 0.06, (0.38, 0.68, 0.20), mats["glow"]),
        ]

    # Distinctive focal pieces make the role readable even when the held prop
    # is occluded by a squad mate.  The geometry stays low-poly but each piece
    # has a clear material and a bone-friendly name.
    if cfg["weapon"] in ("sword", "dagger", "club", "shieldClub", "ram"):
        parts += [sphere("weaponPommel", 0.075, (0, 0.0, 0.0), mats["glow"])]
    if cfg["weapon"] in ("staff", "iceStaff"):
        parts += [
            torus("spellFocusRing", 0.2, 0.035, (0, 1.4, 0.05), mats["accent"], "LOD0"),
            prism("spellFocusShard", [(-0.1, 1.42), (0, 1.62), (0.1, 1.42), (0, 1.28)], 0.08, (0, 0, 0.08), mats["glow"], "LOD0", 0.015),
        ]
    if cfg["weapon"] in ("bow", "sling", "musket"):
        parts += [
            box("rangedSight", (0.08, 0.12, 0.18), (0.23, 1.22, 0.2), mats["metal"], "LOD0", 0.02),
            torus("rangedBadge", 0.09, 0.025, (0, 0.82, 0.25), mats["accent"], "LOD0"),
        ]
    if cfg["armor"] in ("medic", "toolpack", "bandolier", "crystals"):
        parts.append(prism("roleBadge", [(-0.13, 1.2), (0.13, 1.2), (0.1, 0.98), (-0.1, 0.98)], 0.05, (0, 0, 0.25), mats["glow"], "LOD0", 0.012))

    # Role silhouettes use a few authored polygon profiles in addition to the
    # shared body rig.  These are deliberately distinct garment/armour pieces,
    # not recoloured copies of the same box model.
    if cfg["armor"] in ("heavy", "iceArmor", "shield", "lightArmor"):
        parts.append(prism("frontGuard", [(-0.34, 1.34), (0.34, 1.34), (0.28, 0.92), (-0.28, 0.92)], 0.1, (0, 0, 0.2), mats["metal"], "LOD0", 0.035))
    if cfg["armor"] in ("cape", "cloak", "wings", "wingsHeavy"):
        parts.append(prism("capePanel", [(-0.42, 1.46), (0.42, 1.46), (0.54, 0.64), (0.14, 0.52), (-0.54, 0.64)], 0.06, (0, 0, -0.24), mats["cloth"], "LOD0", 0.03))
    if cfg["weapon"] in ("bow", "sling", "musket"):
        parts.append(prism("rangedMantle", [(-0.28, 1.38), (0.28, 1.38), (0.38, 0.85), (-0.38, 0.85)], 0.08, (0, 0, -0.08), mats["leather"], "LOD0", 0.025))
    if cfg["faction"] == "enemy":
        parts.append(prism("raggedHem", [(-0.38, 0.82), (-0.12, 0.72), (0.1, 0.82), (0.35, 0.68), (0.42, 0.56), (-0.42, 0.56)], 0.07, (0, 0, -0.02), mats["dark"], "LOD0", 0.025))

    armor = cfg["armor"]
    if armor in ("shield", "heavy", "iceArmor"):
        parts += [cylinder("shield.rim", 0.1, 0.56, (-0.5, 0.88, 0.08), mats["metal"], "LOD0", 10), box("shield.face", (0.62, 0.72, 0.1), (-0.5, 0.9, 0.03), mats["accent"]), box("shield.gem", (0.12, 0.12, 0.12), (-0.5, 0.9, 0.1), mats["glow"])]
    if armor in ("cape", "cloak"):
        parts += [box("cape", (0.66, 0.88, 0.06), (0, 1.05, -0.23), mats["cloth"], "LOD0", 0.08)]
    if armor == "shoulders":
        parts += [box("pauldron.L", (0.32, 0.22, 0.34), (-0.4, 1.32, 0), mats["metal"]), box("pauldron.R", (0.32, 0.22, 0.34), (0.4, 1.32, 0), mats["metal"])]
    if armor == "quiver":
        parts += [box("quiver", (0.22, 0.58, 0.2), (-0.22, 1.03, -0.2), mats["leather"]), box("arrowBundle", (0.08, 0.5, 0.08), (-0.22, 1.38, -0.2), mats["accent"])]
    if armor == "medic":
        parts += [box("medicPack", (0.42, 0.38, 0.2), (0, 1.0, -0.24), mats["leather"]), box("medicCross", (0.22, 0.08, 0.05), (0, 1.08, 0.2), mats["glow"])]
    if armor == "toolpack":
        parts += [box("toolPack", (0.38, 0.5, 0.24), (0, 1.0, -0.23), mats["leather"]), torus("toolRing", 0.14, 0.04, (0.35, 1.06, 0), mats["accent"])]
    if armor == "bandolier":
        for i in range(4): parts.append(sphere(f"pouch{i}", 0.07, (-0.2 + i * 0.13, 1.1 - i * 0.08, 0.18), mats["accent"]))
    if armor == "crystals":
        for i, x in enumerate((-0.35, 0.35)):
            parts.append(box(f"iceShard{i}", (0.12, 0.4, 0.12), (x, 1.35, 0), mats["ice"], "LOD0", 0.04))
    if armor in ("bombPack", "pouch", "ragged"):
        parts += [box("pack", (0.42, 0.5, 0.24), (0, 1.02, -0.23), mats["leather"]), sphere("core", 0.18, (0, 1.0, 0.2), mats["glow"])]
    if armor == "lightArmor":
        parts += [box("chestPlate", (0.48, 0.38, 0.08), (0, 1.08, 0.18), mats["metal"]), box("knee.L", (0.2, 0.18, 0.22), (-0.13, 0.22, 0.08), mats["accent"]), box("knee.R", (0.2, 0.18, 0.22), (0.13, 0.22, 0.08), mats["accent"])]
    if armor in ("wings", "wingsHeavy"):
        span = 0.7 if armor == "wings" else 1.05
        for side in (-1, 1):
            parts += [box(f"wing.{side}.inner", (span, 0.1, 0.35), (side * 0.48, 1.15, -0.04), mats["accent"]), box(f"wing.{side}.outer", (span * 0.72, 0.08, 0.24), (side * 0.95, 1.12, -0.04), mats["ice"])]
            parts.append(prism(f"wing.{side}.feather", [(-0.1, 1.45), (0.42, 1.32), (0.64, 1.08), (0.18, 1.16)], 0.07, (side * 0.58, 0, -0.06), mats["ice"], "LOD0", 0.018))
        if visual == "flyingColossus":
            # The boss uses a three-panel membrane and a rigid spar on each
            # wing so the flying silhouette reads as a creature, not two flat
            # bars. Panels remain separate meshes for cheap animation and LOD.
            membrane = [(-0.08, 1.48), (0.48, 1.34), (0.82, 1.02), (0.46, 1.04), (0.12, 1.18)]
            for side in (-1, 1):
                mirrored = [(x * side, y) for x, y in membrane]
                parts += [
                    prism(f"wing.{side}.membraneA", mirrored, 0.045, (0, 0, -0.16), mats["cloth"], "LOD0", 0.014),
                    prism(f"wing.{side}.membraneB", [(x * 0.82, y - 0.12) for x, y in mirrored], 0.04, (0, 0, -0.18), mats["accent"], "LOD0", 0.012),
                    cylinder(f"wing.{side}.spar", 0.04, 0.82, (side * 0.58, 1.23, -0.2), mats["metal"], "LOD0", 7),
                ]
                parts[-1].rotation_euler.y = side * math.pi * 0.38
            parts += [
                prism("colossusMantle", [(-0.5, 1.44), (0.5, 1.44), (0.66, 0.9), (0, 0.72), (-0.66, 0.9)], 0.16, (0, 0, -0.28), mats["metal"], "LOD0", 0.025),
                cone("head.colossusHorn.L", 0.14, 0.02, 0.48, (-0.2, 1.98, 0.04), mats["accent"], "LOD0", 7),
                cone("head.colossusHorn.R", 0.14, 0.02, 0.48, (0.2, 1.98, 0.04), mats["accent"], "LOD0", 7),
                sphere("head.colossusEye.L", 0.06, (-0.1, 1.74, 0.3), mats["glow"]),
                sphere("head.colossusEye.R", 0.06, (0.1, 1.74, 0.3), mats["glow"]),
                prism("colossusKneeGuard.L", [(-0.12, 0.44), (0.12, 0.44), (0.08, 0.2), (-0.12, 0.2)], 0.12, (-0.16, 0, 0.2), mats["metal"], "LOD0", 0.018),
                prism("colossusKneeGuard.R", [(-0.12, 0.44), (0.12, 0.44), (0.12, 0.2), (-0.08, 0.2)], 0.12, (0.16, 0, 0.2), mats["metal"], "LOD0", 0.018),
                prism("colossusChestShell", [(-0.44, 1.50), (0.44, 1.50), (0.34, 0.90), (0, 0.76), (-0.34, 0.90)], 0.18, (0, 0, 0.27), mats["metalLight"], "LOD0", 0.03),
                prism("colossusBrow", [(-0.30, 1.86), (0.30, 1.86), (0.22, 1.68), (-0.22, 1.68)], 0.20, (0, 0, 0.30), mats["metal"], "LOD0", 0.025),
                prism("colossusTail", [(-0.26, 0.78), (0.26, 0.78), (0.50, 0.24), (0.0, 0.06), (-0.50, 0.24)], 0.10, (0, 0, -0.32), mats["cloth"], "LOD0", 0.025),
                cone("colossusClaw.L", 0.11, 0.015, 0.34, (-0.28, 0.12, 0.24), mats["metalLight"], "LOD0", 6),
                cone("colossusClaw.R", 0.11, 0.015, 0.34, (0.28, 0.12, 0.24), mats["metalLight"], "LOD0", 6),
            ]
            for side in (-1, 1):
                label = "L" if side < 0 else "R"
                for rib, (x, y, z) in enumerate(((0.44, 1.30, -0.23), (0.62, 1.19, -0.24), (0.78, 1.08, -0.25))):
                    rib_obj = box(f"wingRib.{label}.{rib}", (0.035, 0.035, 0.62), (side * x, y, z), mats["metalLight"], "LOD0", 0.008)
                    rib_obj.rotation_euler.y = side * math.pi * (0.26 + rib * 0.06)
                    parts.append(rib_obj)
            parts += [
                prism("colossusMuzzle", [(-0.23, 1.74), (0.23, 1.74), (0.16, 1.52), (0, 1.45), (-0.16, 1.52)], 0.16, (0, 0, 0.37), mats["metalLight"], "LOD0", 0.022),
                prism("colossusJaw", [(-0.20, 1.55), (0.20, 1.55), (0.14, 1.39), (-0.14, 1.39)], 0.12, (0, 0, 0.34), mats["dark"], "LOD0", 0.018),
                sphere("colossusNoseGem", 0.055, (0, 1.58, 0.48), mats["glow"]),
                box("colossusChestCoreFrame", (0.34, 0.34, 0.06), (0, 1.16, 0.48), mats["metal"], "LOD0", 0.016),
                sphere("colossusChestCore", 0.10, (0, 1.16, 0.53), mats["glow"]),
                box("wingTip.L", (0.08, 0.08, 0.56), (-1.02, 1.08, -0.20), mats["metalLight"], "LOD0", 0.012),
                box("wingTip.R", (0.08, 0.08, 0.56), (1.02, 1.08, -0.20), mats["metalLight"], "LOD0", 0.012),
                torus("tailRing", 0.16, 0.028, (0, 0.42, -0.30), mats["accent"], "LOD0"),
            ]
    if armor == "batteringRam":
        parts += [box("ramFrame", (0.8, 0.24, 0.2), (0, 1.0, 0.28), mats["metal"]), sphere("ramTip", 0.2, (0, 1.0, 0.62), mats["accent"])]

    add_bodycraft_finish(parts, visual, cfg, mats, torso_width, heavy)
    add_role_finish(parts, visual, cfg, mats, torso_width, heavy)
    add_unit_finish(parts, visual, cfg, mats, torso_width, heavy)
    assign_surface_variants(parts, [
        ("_cloth", mats["clothLight"], mats["cloth"]),
        ("_leather", mats["leatherLight"], mats["leather"]),
        ("_metal", mats["metalLight"], mats["metal"]),
        ("_accent", mats["highlight"], mats["accent"]),
        ("_wood", mats["leatherLight"], mats["wood"]),
    ])
    parent_all(parts, root)
    skeleton = make_skeleton(root)
    bind_unit_pieces(parts, skeleton)
    for name in ("weapon_socket", "ranged_socket", "attackAnchor", "banner_socket"):
        socket = empty(name, (0, 1.1, 0.2), "RIG")
        socket.parent = root
    collision_box("COL_Unit", (0.8, 1.9, 0.8), (0, 0.95, 0), root)
    add_armature_clip(skeleton, "Idle", 24, [
        (1, {}),
        (12, {"chest": (0.025, 0, 0), "head": (0, 0.025, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.32, 0, 0), "upper_arm.R": (-0.32, 0, 0), "thigh.L": (-0.45, 0, 0), "thigh.R": (0.45, 0, 0), "chest": (0.04, 0, 0)}),
        (7, {"upper_arm.L": (-0.32, 0, 0), "upper_arm.R": (0.32, 0, 0), "thigh.L": (0.45, 0, 0), "thigh.R": (-0.45, 0, 0), "chest": (-0.02, 0, 0)}),
        (13, {"upper_arm.L": (0.32, 0, 0), "upper_arm.R": (-0.32, 0, 0), "thigh.L": (-0.45, 0, 0), "thigh.R": (0.45, 0, 0), "chest": (0.04, 0, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Attack", 18, [
        (1, {"upper_arm.R": (-0.9, 0, 0), "lower_arm.R": (-0.55, 0, 0), "chest": (-0.12, 0, 0)}),
        (8, {"upper_arm.R": (1.25, 0, 0), "lower_arm.R": (0.5, 0, 0), "chest": (0.22, 0, 0)}),
        (18, {}),
    ])
    add_armature_clip(skeleton, "Cast", 22, [
        (1, {"upper_arm.R": (-1.15, 0, 0), "upper_arm.L": (-0.6, 0, 0), "head": (-0.1, 0, 0)}),
        (11, {"upper_arm.R": (-2.2, 0, 0), "upper_arm.L": (-1.1, 0, 0), "head": (-0.18, 0, 0)}),
        (22, {}),
    ])
    add_armature_clip(skeleton, "Hit", 12, [
        (1, {"chest": (-0.18, 0, 0), "head": (0.12, 0, 0)}),
        (12, {}),
    ])
    add_armature_clip(skeleton, "Death", 20, [
        (1, {}),
        (12, {"root": (1.25, 0, 0), "chest": (0.35, 0, 0), "upper_arm.L": (0.7, 0, 0), "upper_arm.R": (0.7, 0, 0)}),
        (20, {"root": (1.45, 0, 0), "chest": (0.5, 0, 0), "upper_arm.L": (1.1, 0, 0), "upper_arm.R": (1.1, 0, 0)}),
    ])
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", f"{visual}.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", f"{visual}.glb"))
    save_source(source)
    export_glb(output)


def main():
    for visual, cfg in UNITS.items():
        build_unit(visual, cfg)


if __name__ == "__main__":
    main()
