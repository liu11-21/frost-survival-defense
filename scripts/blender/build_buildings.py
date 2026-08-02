"""Build the authored facility library for Frostbound Furnace."""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import (  # noqa: E402
    add_simple_animation,
    add_lod_markers,
    box,
    collision_box,
    cylinder,
    empty,
    export_glb,
    material,
    orient_for_babylon,
    parent_all,
    reset_scene,
    save_source,
    sphere,
    torus,
    vertical_cylinder,
)


BUILDINGS = {
    "mine": {"body": (0.38, 0.27, 0.14), "accent": (0.42, 0.62, 0.7), "kind": "mine"},
    "gold_mine": {"body": (0.42, 0.22, 0.08), "accent": (1.0, 0.65, 0.12), "kind": "goldMine"},
    "lumberyard": {"body": (0.36, 0.18, 0.08), "accent": (0.8, 0.45, 0.15), "kind": "lumberyard"},
    "warehouse": {"body": (0.34, 0.24, 0.16), "accent": (0.95, 0.68, 0.28), "kind": "warehouse"},
    "recruit_hall": {"body": (0.26, 0.24, 0.36), "accent": (0.82, 0.3, 0.18), "kind": "recruitHall"},
    "auto_collector": {"body": (0.14, 0.22, 0.26), "accent": (0.28, 1.0, 0.62), "kind": "autoCollector"},
    "auto_rebuilder": {"body": (0.16, 0.2, 0.26), "accent": (0.28, 0.7, 1.0), "kind": "autoRebuilder"},
    "crossbow_tower": {"body": (0.36, 0.2, 0.08), "accent": (0.94, 0.58, 0.18), "kind": "crossbowTower"},
    "frost_tower": {"body": (0.18, 0.46, 0.64), "accent": (0.42, 0.94, 1.0), "kind": "frostTower"},
    "sniper_tower": {"body": (0.3, 0.32, 0.4), "accent": (0.5, 0.85, 1.0), "kind": "sniperTower"},
    "mortar": {"body": (0.24, 0.25, 0.3), "accent": (1.0, 0.3, 0.1), "kind": "mortar"},
    "furnace": {"body": (0.28, 0.24, 0.2), "accent": (1.0, 0.42, 0.12), "kind": "furnace"},
}


def make_materials(key, cfg):
    return {
        "stone": material(f"MAT_{key}_stone", cfg["body"], 0.94),
        "wood": material(f"MAT_{key}_wood", (0.36, 0.19, 0.08), 0.88),
        "darkwood": material(f"MAT_{key}_darkwood", (0.2, 0.11, 0.06), 0.9),
        "metal": material(f"MAT_{key}_metal", (0.32, 0.39, 0.48), 0.28, 0.86),
        "dark": material(f"MAT_{key}_dark", (0.05, 0.06, 0.08), 0.58, 0.5),
        "accent": material(f"MAT_{key}_accent", cfg["accent"], 0.38, 0.25),
        "glow": material(f"MAT_{key}_glow", cfg["accent"], 0.22, 0, cfg["accent"]),
        "ice": material(f"MAT_{key}_ice", (0.5, 0.86, 1.0), 0.2, 0.18, (0.22, 0.7, 1.0)),
        "gold": material(f"MAT_{key}_gold", (1.0, 0.55, 0.08), 0.24, 0.78, (0.8, 0.25, 0.03)),
        "snow": material(f"MAT_{key}_snow", (0.8, 0.9, 0.98), 0.78),
        "glass": material(f"MAT_{key}_glass", (0.18, 0.58, 0.9), 0.12, 0.12, (0.08, 0.32, 0.75)),
    }


def attack_pivot(root, mats, key, style):
    yaw = empty("yawPivot", (0, 1.35, 0), "EXPORT", "CUBE")
    yaw.parent = root
    pitch = empty("pitchPivot", (0, 0.0, 0), "EXPORT", "CUBE")
    pitch.parent = yaw
    if style == "crossbow":
        parts = [box("barrel", (0.16, 0.16, 1.2), (0, 0, 0.35), mats["wood"]), box("limb.L", (0.9, 0.1, 0.1), (-0.35, 0.0, 0), mats["accent"]), box("limb.R", (0.9, 0.1, 0.1), (0.35, 0.0, 0), mats["accent"])]
    elif style == "frost":
        parts = [cylinder("barrel", 0.9, 0.16, (0, 0, 0.32), mats["ice"], "LOD0", 6), torus("frostRing", 0.3, 0.05, (0, 0.25, 0.2), mats["metal"])]
    elif style == "sniper":
        parts = [box("barrel", (0.2, 0.22, 1.6), (0, 0, 0.55), mats["dark"]), cylinder("scope", 0.6, 0.07, (0, 0.2, 0.42), mats["metal"], "LOD0", 8), sphere("lens", 0.09, (0, 0, 1.36), mats["glow"])]
    else:
        parts = [cylinder("barrel", 1.5 if style == "mortar" else 1.0, 0.38 if style == "mortar" else 0.22, (0, 0, 0.5), mats["dark"], "LOD0", 8), sphere("muzzle", 0.14, (0, 0, 1.24), mats["glow"])]
    parent_all(parts, pitch)
    recoil = empty("recoilPart", (0, 0, 0), "EXPORT", "CUBE")
    recoil.parent = pitch
    empty("muzzle", (0, 0, 1.3), "EXPORT", "PLAIN_AXES").parent = pitch
    return yaw, pitch, recoil


def build_facility(key, cfg):
    reset_scene()
    mats = make_materials(key, cfg)
    root_name = "FurnaceRoot" if cfg["kind"] == "furnace" else "BuildingRoot"
    root = orient_for_babylon(empty(root_name, target="EXPORT", display="CUBE"))
    add_lod_markers(root)
    parts = []
    functional = []
    kind = cfg["kind"]

    # Every facility receives a layered plinth, a readable main mass and a
    # focal functional component. These are deliberately different silhouettes
    # rather than recoloured boxes.
    parts += [cylinder("plinth", 0.3, 2.1 if kind not in ("furnace", "warehouse", "recruitHall") else 2.7, (0, 0.15, 0), mats["stone"], "LOD0", 8)]
    if kind == "mine" or kind == "goldMine":
        for x in (-0.85, 0.85):
            parts.append(box(f"derrick.{x}", (0.16, 1.6, 0.16), (x, 0.95, 0), mats["wood"]))
        parts += [box("derrick.top", (1.9, 0.18, 0.18), (0, 1.75, 0), mats["wood"]), box("shaftMouth", (1.45, 1.15, 0.5), (0, 0.8, -0.8), mats["dark"]), cylinder("orePile", 0.55, 0.4, (0.62, 0.4, 0.55), mats["gold" if kind == "goldMine" else "ice"], "LOD0", 7)]
        functional += [box("workPart", (0.85, 0.18, 0.18), (0, 1.35, -0.78), mats["metal"]), sphere("productionCore", 0.16, (0, 1.88, 0), mats["gold" if kind == "goldMine" else "glow"])]
    elif kind == "lumberyard":
        for x in (-1.0, 1.0):
            for z in (-0.8, 0.8): parts.append(box(f"post.{x}.{z}", (0.18, 1.7, 0.18), (x, 0.92, z), mats["wood"]))
        parts += [box("roof.left", (2.8, 0.18, 1.0), (0, 1.95, -0.48), mats["darkwood"]), box("roof.right", (2.8, 0.18, 1.0), (0, 1.95, 0.48), mats["darkwood"]), cylinder("sawWheel", 0.1, 1.0, (0, 0.95, 0.72), mats["metal"], "LOD0", 12), box("logStack", (2.0, 0.32, 0.4), (0, 0.52, 0.9), mats["wood"])]
        functional += [empty("workPart", (0, 1.0, 0.7), "EXPORT", "CUBE"), torus("productionCore", 0.34, 0.06, (0, 1.0, 0.72), mats["accent"])]
    elif kind == "warehouse":
        parts += [box("warehouseBody", (2.7, 1.8, 2.3), (0, 1.0, 0), mats["wood"]), box("door", (1.0, 1.2, 0.12), (0, 0.78, -1.2), mats["darkwood"]), box("roof.left", (3.2, 0.22, 1.55), (0, 2.15, -0.6), mats["darkwood"]), box("roof.right", (3.2, 0.22, 1.55), (0, 2.15, 0.6), mats["darkwood"]), box("ridge", (3.3, 0.2, 0.2), (0, 2.58, 0), mats["metal"])]
        parts += [box("crateA", (0.65, 0.65, 0.65), (-1.7, 0.38, 0.6), mats["wood"]), box("crateB", (0.62, 0.62, 0.62), (1.6, 0.35, -0.55), mats["wood"])]
        functional += [box("workPart", (0.7, 0.35, 0.08), (0, 1.75, -1.25), mats["accent"]), sphere("productionCore", 0.12, (0, 1.55, 0), mats["glow"])]
    elif kind == "recruitHall":
        parts += [box("hallBody", (2.6, 1.9, 2.2), (0, 1.0, 0), mats["wood"]), box("gate", (1.2, 1.35, 0.12), (0, 0.82, -1.16), mats["dark"]), box("roof", (3.25, 0.24, 2.8), (0, 2.08, 0), mats["darkwood"]), cylinder("watchtower", 1.2, 0.85, (0.85, 2.68, 0.4), mats["stone"], "LOD0", 8)]
        for x in (-1.25, 1.25): parts += [cylinder(f"flagPole.{x}", 1.5, 0.05, (x, 1.7, -1.25), mats["metal"], "LOD0", 6), box(f"flag.{x}", (0.45, 0.38, 0.04), (x + 0.2, 2.2, -1.25), mats["accent"])]
        functional += [box("workPart", (1.2, 0.18, 0.1), (0, 1.75, 1.1), mats["metal"]), sphere("productionCore", 0.13, (0, 2.62, 0.4), mats["glow"])]
    elif kind == "autoCollector":
        parts += [cylinder("pylon", 2.25, 0.5, (0, 1.25, 0), mats["metal"], "LOD0", 8), torus("collectorRingA", 0.85, 0.08, (0, 1.95, 0), mats["accent"]), torus("collectorRingB", 1.25, 0.06, (0, 2.35, 0), mats["metal"]), box("hopper", (0.7, 0.4, 0.7), (0, 2.7, 0), mats["dark"])]
        functional += [empty("workPart", (0, 2.05, 0), "EXPORT", "CUBE"), sphere("productionCore", 0.22, (0, 2.7, 0), mats["glow"])]
    elif kind == "autoRebuilder":
        for x in (-0.9, 0.9):
            for z in (-0.9, 0.9): parts.append(box(f"frame.{x}.{z}", (0.18, 2.0, 0.18), (x, 1.15, z), mats["metal"]))
        parts += [box("topFrame", (2.2, 0.2, 2.2), (0, 2.3, 0), mats["dark"]), cylinder("craneCore", 0.65, 0.6, (0, 1.35, 0), mats["accent"], "LOD0", 8), box("jib", (0.16, 0.16, 2.5), (0, 2.72, 0.65), mats["metal"])]
        functional += [empty("workPart", (0, 1.35, 0), "EXPORT", "CUBE"), sphere("productionCore", 0.18, (0, 2.9, 0.0), mats["glow"])]
    elif kind in ("crossbowTower", "frostTower", "sniperTower", "mortar"):
        if kind == "crossbowTower":
            for x in (-0.72, 0.72):
                for z in (-0.72, 0.72): parts.append(box(f"leg.{x}.{z}", (0.18, 1.3, 0.18), (x, 0.85, z), mats["wood"]))
            parts += [box("deck", (1.8, 0.16, 1.8), (0, 1.58, 0), mats["wood"])]
            attack_pivot(root, mats, key, "crossbow")
        elif kind == "frostTower":
            parts += [cylinder("spire", 2.1, 0.34, (0, 1.35, 0), mats["ice"], "LOD0", 6), torus("ring", 0.9, 0.08, (0, 2.25, 0), mats["metal"]), sphere("crystalCore", 0.25, (0, 2.9, 0), mats["glow"])]
            attack_pivot(root, mats, key, "frost")
        elif kind == "sniperTower":
            parts += [cylinder("shaft", 3.2, 0.55, (0, 1.9, 0), mats["stone"], "LOD0", 8), box("deck", (1.6, 0.16, 1.6), (0, 3.7, 0), mats["metal"]), box("railA", (1.6, 0.35, 0.08), (0, 3.95, 0.75), mats["dark"]), box("railB", (1.6, 0.35, 0.08), (0, 3.95, -0.75), mats["dark"])]
            attack_pivot(root, mats, key, "sniper")
        else:
            parts += [box("cradleL", (0.3, 1.0, 1.6), (-0.9, 0.9, 0), mats["metal"]), box("cradleR", (0.3, 1.0, 1.6), (0.9, 0.9, 0), mats["metal"]), sphere("shellRack", 0.32, (-1.1, 0.65, -0.72), mats["accent"])]
            attack_pivot(root, mats, key, "mortar")
        functional += [sphere("productionCore", 0.13, (0, 2.55, 0), mats["glow"])]
    elif kind == "furnace":
        parts += [cylinder("furnaceBody", 1.8, 2.5, (0, 1.0, 0), mats["stone"], "LOD0", 10), cylinder("coalBowl", 0.35, 1.5, (0, 2.0, 0), mats["dark"], "LOD0", 10), sphere("heatCore", 0.52, (0, 2.05, 0), mats["glow"]), torus("furnaceCrown", 1.8, 0.16, (0, 2.8, 0), mats["accent"])]
        for i in range(4):
            angle = i * math.pi * 0.5
            parts.append(box(f"rune.{i}", (0.12, 0.42, 0.06), (math.sin(angle) * 1.28, 1.1, math.cos(angle) * 1.28), mats["glow"]))
        functional += [empty("workPart", (0, 2.05, 0), "EXPORT", "CUBE"), empty("productionCore", (0, 2.05, 0), "EXPORT", "CUBE"), empty("emitter", (0, 2.55, 0), "EXPORT", "PLAIN_AXES")]

    # Shared authored-art language: layered stone footing, readable fasteners,
    # snow breaks and a small emissive identity mark. These details are kept
    # lightweight but remove the flat "one primitive per building" read.
    parts += [
        torus("plinthTrim", 0.91 if kind not in ("warehouse", "recruitHall") else 1.12, 0.055, (0, 0.31, 0), mats["metal"], "LOD0"),
        torus("plinthSnow", 0.82 if kind not in ("warehouse", "recruitHall") else 1.05, 0.045, (0, 0.38, 0), mats["snow"], "LOD0"),
        sphere("identityLamp", 0.11, (0, 1.15, -0.88), mats["glow"]),
    ]
    for i, angle in enumerate((0.25, 1.8, 3.35, 4.9)):
        x, z = math.sin(angle) * 0.86, math.cos(angle) * 0.86
        parts.append(sphere(f"plinthBolt.{i}", 0.055, (x, 0.42, z), mats["metal"]))
    if kind in ("mine", "goldMine"):
        # A readable pulley and cable make the shaft functional at a glance.
        parts += [
            torus("pulley", 0.22, 0.045, (0, 1.58, -0.02), mats["metal"], "LOD0"),
            vertical_cylinder("cable", 0.025, 0.9, (0, 1.18, -0.02), mats["dark"], "LOD0", 6),
            sphere("oreHighlight", 0.08, (0.62, 0.58, 0.58), mats["glow"]),
        ]
    elif kind == "lumberyard":
        parts += [
            torus("sawGuard", 0.56, 0.045, (0, 0.95, 0.73), mats["snow"], "LOD0"),
            box("sawToothBar", (1.05, 0.08, 0.08), (0, 1.0, 0.73), mats["metal"], "LOD0", 0.025),
            box("signBoard", (0.9, 0.42, 0.06), (0, 1.48, -0.86), mats["accent"], "LOD0", 0.06),
        ]
    elif kind == "warehouse":
        parts += [
            box("doorFrameL", (0.1, 1.42, 0.16), (-0.62, 0.85, -1.23), mats["metal"], "LOD0", 0.035),
            box("doorFrameR", (0.1, 1.42, 0.16), (0.62, 0.85, -1.23), mats["metal"], "LOD0", 0.035),
            box("warehouseSign", (1.28, 0.32, 0.08), (0, 1.92, -1.16), mats["accent"], "LOD0", 0.055),
        ]
    elif kind == "recruitHall":
        parts += [
            box("hallSign", (1.5, 0.4, 0.08), (0, 2.04, -1.2), mats["accent"], "LOD0", 0.06),
            sphere("hallLanternL", 0.12, (-0.8, 1.52, -1.22), mats["glow"]),
            sphere("hallLanternR", 0.12, (0.8, 1.52, -1.22), mats["glow"]),
        ]
    elif kind in ("autoCollector", "autoRebuilder"):
        for x in (-0.55, 0.55):
            parts += [
                vertical_cylinder(f"pipe.{x}", 0.045, 1.3, (x, 1.2, -0.35), mats["metal"], "LOD0", 7),
                sphere(f"pipeLamp.{x}", 0.1, (x, 1.9, -0.35), mats["glow"]),
            ]
    elif kind in ("crossbowTower", "frostTower", "sniperTower", "mortar"):
        # Bolted handrails / ice emitters distinguish the attack facility from
        # the economy props even before it acquires a firing animation.
        parts += [
            torus("attackTrim", 0.56, 0.05, (0, 1.05, 0), mats["accent"], "LOD0"),
            sphere("ammoLamp", 0.1, (0, 1.35, -0.56), mats["glow"]),
        ]
    elif kind == "furnace":
        parts += [
            cylinder("chimney", 0.42, 0.9, (0, 2.95, 0), mats["stone"], "LOD0", 10),
            torus("chimneyCap", 0.48, 0.08, (0, 3.38, 0), mats["snow"], "LOD0"),
            sphere("flameCrown", 0.24, (0, 2.72, 0), mats["glow"]),
        ]

    parent_all(parts + functional, root)
    collision_box("COL_Building", (2.5, 3.5, 2.5), (0, 1.5, 0), root)
    if kind not in ("mine", "goldMine", "lumberyard", "warehouse", "recruitHall", "autoCollector", "autoRebuilder", "furnace"):
        if not any(obj.name == "yawPivot" for obj in bpy.context.scene.objects): attack_pivot(root, mats, key, "tower")
    # Stable clips are intentionally present on every facility; controllers can
    # play the specific subset they understand without special-casing assets.
    for name, amount, end in (("Idle", 0.025, 24), ("Operate", 0.14, 20), ("Aim", 0.1, 16), ("Fire", -0.18, 12), ("Recoil", -0.2, 12), ("Damaged", 0.16, 14), ("Destroyed", -0.5, 18)):
        add_simple_animation(root, name, amount=amount, end=end)
    # Also key the functional sub-part so the authored clips visibly operate
    # in Babylon. The root clips above preserve a stable contract for assets
    # without a moving sub-part; these channels are merged by the glTF exporter
    # under the same named animation groups.
    motion = next((obj for obj in functional if obj.type in ("MESH", "EMPTY")), root)
    add_simple_animation(motion, "Operate", property_path="rotation_euler", index=2, amount=0.22, end=20)
    add_simple_animation(motion, "Fire", property_path="scale", index=0, amount=1.08, end=12)
    recoil = next((obj for obj in bpy.context.scene.objects if obj.name == "recoilPart"), None)
    if recoil:
        add_simple_animation(recoil, "Recoil", property_path="location", index=2, amount=-0.16, end=12)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "buildings", f"{key}.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "buildings", f"{key}.glb"))
    save_source(source)
    export_glb(output)


def main():
    for key, cfg in BUILDINGS.items():
        build_facility(key, cfg)


if __name__ == "__main__":
    main()
