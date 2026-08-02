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
    box,
    collision_box,
    cylinder,
    empty,
    material,
    move_to,
    orient_for_babylon,
    parent_all,
    reset_scene,
    save_source,
    sphere,
    torus,
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
        parts += [box(f"{prefix}.blade", (0.08, 0.72 if kind == "sword" else 0.42, 0.16), (0.0, 0.0, 0.08), mats["metal"])]
        parts += [cylinder(f"{prefix}.guard", 0.06, 0.46, (0, -0.32, 0), mats["accent"], "LOD0", 8)]
        parts += [box(f"{prefix}.grip", (0.1, 0.2, 0.1), (0, -0.5, 0), mats["leather"])]
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


def build_unit(visual, cfg):
    reset_scene()
    body_color = cfg["body"]
    accent_color = cfg["accent"]
    mats = {
        "cloth": material(f"MAT_{visual}_cloth", body_color, 0.86),
        "leather": material(f"MAT_{visual}_leather", tuple(max(0.02, c * 0.52) for c in body_color), 0.9),
        "metal": material(f"MAT_{visual}_metal", (0.34, 0.4, 0.5), 0.3, 0.85),
        "skin": material(f"MAT_{visual}_skin", (0.62, 0.38, 0.28) if cfg["faction"] == "enemy" else (0.78, 0.58, 0.42), 0.78),
        "accent": material(f"MAT_{visual}_accent", accent_color, 0.42, 0.35),
        "glow": material(f"MAT_{visual}_glow", accent_color, 0.25, 0.0, accent_color),
        "ice": material(f"MAT_{visual}_ice", (0.55, 0.86, 1.0), 0.24, 0.15, (0.25, 0.7, 1.0)),
        "wood": material(f"MAT_{visual}_wood", (0.38, 0.2, 0.1), 0.86),
        "dark": material(f"MAT_{visual}_dark", (0.045, 0.05, 0.08), 0.62, 0.35),
    }
    root = orient_for_babylon(empty("UnitRoot", target="EXPORT", display="CUBE"))
    parts = []
    parts += [box("torso", (0.52 if cfg["armor"] in ("heavy", "iceArmor", "batteringRam", "wingsHeavy") else 0.44, 0.62, 0.34), (0, 0.98, 0), mats["cloth"])]
    parts += [box("belt", (0.55, 0.09, 0.38), (0, 0.67, 0), mats["leather"])]
    parts += [sphere("head", 0.28, (0, 1.7, 0), mats["skin"])]
    parts += [box("leg.L", (0.18, 0.55, 0.2), (-0.13, 0.38, 0), mats["leather"]), box("leg.R", (0.18, 0.55, 0.2), (0.13, 0.38, 0), mats["leather"])]
    parts += [box("boot.L", (0.22, 0.12, 0.32), (-0.13, 0.08, 0.06), mats["dark"]), box("boot.R", (0.22, 0.12, 0.32), (0.13, 0.08, 0.06), mats["dark"])]
    parts += [box("arm.L", (0.17, 0.58, 0.18), (-0.38, 1.02, 0), mats["cloth"]), box("arm.R", (0.17, 0.58, 0.18), (0.38, 1.02, 0), mats["cloth"])]
    parts += [box("shoulder.L", (0.25, 0.15, 0.27), (-0.34, 1.28, 0), mats["accent"]), box("shoulder.R", (0.25, 0.15, 0.27), (0.34, 1.28, 0), mats["accent"])]
    parts += add_crest(root, cfg["crest"], mats)
    parts += build_weapon(root, cfg["weapon"], mats, "weapon")

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
    if armor == "batteringRam":
        parts += [box("ramFrame", (0.8, 0.24, 0.2), (0, 1.0, 0.28), mats["metal"]), sphere("ramTip", 0.2, (0, 1.0, 0.62), mats["accent"])]

    parent_all(parts, root)
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    skeleton = bpy.context.object
    skeleton.name = "UnitSkeleton"
    skeleton.data.name = "UnitSkeleton"
    skeleton.parent = root
    armature = skeleton.data
    armature.edit_bones.remove(armature.edit_bones[0])
    previous = None
    for index, name in enumerate(("root", "pelvis", "spine", "chest", "neck", "head", "upper_arm.L", "upper_arm.R", "lower_arm.L", "lower_arm.R", "hand.L", "hand.R", "thigh.L", "thigh.R", "shin.L", "shin.R", "foot.L", "foot.R")):
        bone = armature.edit_bones.new(name)
        bone.head = (0, index * 0.1, 0)
        bone.tail = (0, index * 0.1 + 0.1, 0)
        if previous and index < 6:
            bone.parent = previous
        previous = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    move_to(skeleton, "RIG")
    for name in ("weapon_socket", "ranged_socket", "attackAnchor", "banner_socket"):
        socket = empty(name, (0, 1.1, 0.2), "RIG")
        socket.parent = root
    collision_box("COL_Unit", (0.8, 1.9, 0.8), (0, 0.95, 0), root)
    for name, amount, end in (("Idle", 0.035, 24), ("Walk", 0.14, 24), ("Attack", -0.42, 18), ("Cast", 0.52, 22), ("Hit", -0.18, 12), ("Death", -0.9, 20)):
        add_simple_animation(root, name, amount=amount, end=end)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", f"{visual}.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", f"{visual}.glb"))
    save_source(source)
    export_glb(output)


def main():
    for visual, cfg in UNITS.items():
        build_unit(visual, cfg)


if __name__ == "__main__":
    main()
