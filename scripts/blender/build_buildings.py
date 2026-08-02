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
    assign_surface_variants,
    box,
    collision_box,
    cone,
    cylinder,
    empty,
    export_glb,
    material,
    orient_for_babylon,
    parent_all,
    prism,
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
        "stoneLight": material(f"MAT_{key}_stoneLight", tuple(min(1.0, c * 1.35 + 0.04) for c in cfg["body"]), 0.9),
        "stoneDark": material(f"MAT_{key}_stoneDark", tuple(max(0.02, c * 0.58) for c in cfg["body"]), 0.97),
        "wood": material(f"MAT_{key}_wood", (0.36, 0.19, 0.08), 0.88),
        "woodLight": material(f"MAT_{key}_woodLight", (0.56, 0.31, 0.12), 0.82),
        "darkwood": material(f"MAT_{key}_darkwood", (0.2, 0.11, 0.06), 0.9),
        "metal": material(f"MAT_{key}_metal", (0.32, 0.39, 0.48), 0.28, 0.86),
        "metalLight": material(f"MAT_{key}_metalLight", (0.55, 0.64, 0.74), 0.22, 0.9),
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
        parts = [
            box("barrel", (0.16, 0.16, 1.2), (0, 0, 0.35), mats["wood"]),
            prism("stockProfile", [(-0.16, -0.10), (0.16, -0.10), (0.11, 0.20), (-0.08, 0.34)], 0.16, (0, 0, 0.20), mats["woodLight"], "LOD0", 0.018),
            prism("limb.L", [(-0.48, 0.06), (-0.24, 0.15), (0.02, 0.1), (-0.06, -0.02), (-0.3, -0.1)], 0.12, (-0.35, 0, 0.02), mats["accent"], "LOD0", 0.015),
            prism("limb.R", [(-0.02, 0.1), (0.24, 0.15), (0.48, 0.06), (0.3, -0.1), (0.06, -0.02)], 0.12, (0.35, 0, 0.02), mats["accent"], "LOD0", 0.015),
            box("bowGrip", (0.14, 0.18, 0.18), (0, 0, 0.04), mats["metal"], "LOD0", 0.025),
            box("bowString", (0.035, 0.035, 0.95), (0, 0.02, 0.02), mats["dark"], "LOD0", 0.008),
            box("boltRail", (0.10, 0.08, 1.05), (0, 0.10, 0.56), mats["metalLight"], "LOD0", 0.012),
            sphere("boltHead", 0.065, (0, 0.10, 1.15), mats["glow"]),
            torus("winch", 0.16, 0.04, (0, -0.04, 0.44), mats["metal"], "LOD0"),
            cylinder("winchAxle", 0.035, 0.42, (0, -0.04, 0.44), mats["accent"], "LOD0", 8),
            torus("drawWheel.L", 0.12, 0.025, (-0.34, 0.02, 0.04), mats["metalLight"], "LOD0"),
            torus("drawWheel.R", 0.12, 0.025, (0.34, 0.02, 0.04), mats["metalLight"], "LOD0"),
        ]
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


def add_facility_finish(parts, kind, mats):
    """Add a construction/detail layer shared by the facility library."""
    parts += [
        torus("foundationCourse", 0.94 if kind not in ("warehouse", "recruitHall") else 1.2, 0.055, (0, 0.48, 0), mats["metalLight"], "LOD0"),
        box("servicePlate", (0.72, 0.045, 0.045), (0, 0.78, -1.12), mats["metalLight"], "LOD0", 0.01),
        sphere("serviceBolt.L", 0.045, (-0.38, 0.80, -1.14), mats["accent"]),
        sphere("serviceBolt.R", 0.045, (0.38, 0.80, -1.14), mats["accent"]),
    ]

    if kind in ("mine", "goldMine"):
        parts += [
            box("derrickBrace.L", (0.09, 0.12, 1.45), (-0.43, 1.04, -0.02), mats["woodLight"], "LOD0", 0.02),
            box("derrickBrace.R", (0.09, 0.12, 1.45), (0.43, 1.04, -0.02), mats["woodLight"], "LOD0", 0.02),
            torus("winchDrum", 0.18, 0.045, (0, 1.43, -0.78), mats["metalLight"], "LOD0"),
            sphere("oreChunkA", 0.12, (-0.22, 0.48, 0.54), mats["gold" if kind == "goldMine" else "ice"]),
            sphere("oreChunkB", 0.09, (0.12, 0.42, 0.64), mats["gold" if kind == "goldMine" else "ice"]),
            box("mineRail.L", (1.45, 0.06, 0.07), (-0.45, 0.34, -0.18), mats["metal"], "LOD0", 0.012),
            box("mineRail.R", (1.45, 0.06, 0.07), (0.45, 0.34, -0.18), mats["metal"], "LOD0", 0.012),
            torus("mineCartWheel.L", 0.11, 0.035, (-0.30, 0.36, -0.64), mats["metalLight"], "LOD0"),
            torus("mineCartWheel.R", 0.11, 0.035, (0.30, 0.36, -0.64), mats["metalLight"], "LOD0"),
        ]
        if kind == "goldMine":
            parts += [
                box("goldIngotStack.A", (0.26, 0.12, 0.14), (-0.58, 0.58, 0.62), mats["gold"], "LOD0", 0.018),
                box("goldIngotStack.B", (0.22, 0.10, 0.12), (-0.48, 0.72, 0.62), mats["gold"], "LOD0", 0.016),
            ]
    elif kind == "lumberyard":
        parts += [
            cylinder("logEnd.L", 0.22, 0.10, (-0.6, 0.56, 0.92), mats["woodLight"], "LOD0", 10),
            cylinder("logEnd.R", 0.22, 0.10, (0.6, 0.56, 0.92), mats["woodLight"], "LOD0", 10),
            box("beamJoin", (1.7, 0.10, 0.10), (0, 1.42, 0.54), mats["metalLight"], "LOD0", 0.018),
            torus("sawHub", 0.12, 0.035, (0, 0.95, 0.72), mats["accent"], "LOD0"),
            *(box(f"sawTooth.{i}", (0.08, 0.08, 0.18), (-0.48 + i * 0.16, 1.08, 0.72), mats["metalLight"], "LOD0", 0.012) for i in range(7)),
            torus("logCradle", 0.42, 0.045, (0, 0.60, 0.92), mats["metal"], "LOD0"),
            box("logCraneHook", (0.08, 0.44, 0.08), (0.82, 1.20, 0.34), mats["metalLight"], "LOD0", 0.015),
        ]
    elif kind in ("warehouse", "recruitHall"):
        for side in (-1, 1):
            parts += [
                box(f"timberFrame.{side}", (0.12, 1.25, 0.12), (side * 1.05, 1.02, -0.98), mats["woodLight"], "LOD0", 0.025),
                box(f"window.{side}", (0.38, 0.42, 0.045), (side * 0.78, 1.40, -1.16), mats["glass"], "LOD0", 0.02),
                sphere(f"windowLamp.{side}", 0.055, (side * 0.78, 1.18, -1.20), mats["glow"]),
                box(f"windowCross.{side}", (0.035, 0.42, 0.055), (side * 0.78, 1.40, -1.19), mats["metalLight"], "LOD0", 0.008),
            ]
        parts += [
            box("roofTruss.L", (0.10, 0.10, 2.2), (-0.58, 2.28, 0), mats["woodLight"], "LOD0", 0.014),
            box("roofTruss.R", (0.10, 0.10, 2.2), (0.58, 2.28, 0), mats["woodLight"], "LOD0", 0.014),
        ]
    elif kind == "autoCollector":
        for side in (-1, 1):
            arm = box(f"collectorArm.{side}", (0.10, 0.10, 1.8), (side * 0.62, 2.05, 0), mats["metalLight"], "LOD0", 0.018)
            arm.rotation_euler.y = side * math.pi * 0.20
            parts += [arm, sphere(f"collectorJoint.{side}", 0.11, (side * 0.62, 2.05, 0), mats["accent"]), cone(f"collectorNozzle.{side}", 0.12, 0.035, 0.34, (side * 0.92, 1.72, 0), mats["glass"], "LOD0", 6)]
        parts += [torus("collectorFilter", 0.32, 0.04, (0, 2.70, -0.12), mats["metalLight"], "LOD0"), sphere("collectorCoreLens", 0.12, (0, 2.70, -0.30), mats["glow"])]
    elif kind == "autoRebuilder":
        parts += [
            torus("craneBearing", 0.72, 0.055, (0, 1.38, 0), mats["metalLight"], "LOD0"),
            sphere("repairHead", 0.18, (0, 2.70, 1.85), mats["glow"]),
            vertical_cylinder("repairCable", 0.028, 1.4, (0, 2.0, 1.86), mats["dark"], "LOD0", 6),
            box("repairArm.L", (0.12, 0.12, 1.4), (-0.42, 2.15, 0.72), mats["metalLight"], "LOD0", 0.018),
            box("repairArm.R", (0.12, 0.12, 1.4), (0.42, 2.15, 0.72), mats["metalLight"], "LOD0", 0.018),
            sphere("repairClamp.L", 0.10, (-0.42, 1.48, 1.35), mats["accent"]),
            sphere("repairClamp.R", 0.10, (0.42, 1.48, 1.35), mats["accent"]),
        ]
    elif kind == "crossbowTower":
        parts += [
            torus("bowPivotRing", 0.34, 0.045, (0, 1.62, 0.05), mats["metalLight"], "LOD0"),
            sphere("stringAnchor.L", 0.06, (-0.48, 1.64, -0.60), mats["accent"]),
            sphere("stringAnchor.R", 0.06, (0.48, 1.64, -0.60), mats["accent"]),
        ]
    elif kind == "frostTower":
        for side in (-1, 1):
            parts += [
                cone(f"iceShard.{side}", 0.12, 0.025, 0.58, (side * 0.46, 2.15, 0.02), mats["ice"], "LOD0", 6),
                torus(f"iceBand.{side}", 0.20, 0.025, (side * 0.46, 2.08, 0.02), mats["metalLight"], "LOD0"),
            ]
    elif kind == "sniperTower":
        parts += [
            box("ladderRail.L", (0.08, 1.3, 0.08), (-0.55, 2.55, -0.88), mats["metalLight"], "LOD0", 0.015),
            box("ladderRail.R", (0.08, 1.3, 0.08), (0.55, 2.55, -0.88), mats["metalLight"], "LOD0", 0.015),
            *(box(f"ladderStep.{i}", (1.1, 0.06, 0.06), (0, 2.05 + i * 0.26, -0.88), mats["metal"], "LOD0", 0.012) for i in range(4)),
            box("sniperSightHousing", (0.34, 0.16, 0.44), (0, 3.84, 0.22), mats["metalLight"], "LOD0", 0.018),
            sphere("sniperSightLens", 0.08, (0, 3.84, 0.46), mats["glow"]),
        ]
    elif kind == "mortar":
        parts += [
            torus("shellBelt", 0.44, 0.045, (0, 1.18, 0), mats["metalLight"], "LOD0"),
            sphere("shellA", 0.10, (-0.34, 0.70, -0.74), mats["accent"]),
            sphere("shellB", 0.10, (-0.10, 0.70, -0.84), mats["accent"]),
            sphere("shellC", 0.10, (0.14, 0.70, -0.74), mats["accent"]),
            box("mortarBreech", (0.48, 0.28, 0.44), (0, 1.08, -0.26), mats["metalLight"], "LOD0", 0.025),
            torus("mortarFuseRing", 0.13, 0.025, (0, 1.24, 0.02), mats["accent"], "LOD0"),
        ]


def add_signature_facility_finish(parts, kind, mats):
    """Add the fourth-pass construction language to the facility silhouettes.

    These are structural pieces, not a second coat of colour: corner loads,
    access panels, fasteners and functional housings make the buildings read
    as authored game props even when their animated pivot is idle.
    """
    # Shared service hardware gives every building a believable maintenance
    # face and keeps the prop family visually coherent.
    parts += [
        box("servicePanelInset", (0.54, 0.24, 0.035), (0, 0.92, -1.15), mats["dark"], "LOD0", 0.012),
        box("servicePanelTrim", (0.62, 0.035, 0.045), (0, 1.06, -1.18), mats["metalLight"], "LOD0", 0.008),
        sphere("servicePanelLamp", 0.045, (0, 0.92, -1.20), mats["glow"]),
    ]

    if kind in ("mine", "goldMine"):
        parts += [
            box("mineBeamCap", (2.15, 0.12, 0.16), (0, 1.78, 0.04), mats["metalLight"], "LOD0", 0.018),
            prism("mineRoof.L", [(-0.98, 1.78), (-0.10, 1.78), (-0.28, 2.12), (-0.86, 2.12)], 0.10, (-0.10, 0, 0.04), mats["woodLight"], "LOD0", 0.018),
            prism("mineRoof.R", [(0.10, 1.78), (0.98, 1.78), (0.86, 2.12), (0.28, 2.12)], 0.10, (0.10, 0, 0.04), mats["woodLight"], "LOD0", 0.018),
        ]
    elif kind == "lumberyard":
        parts += [
            box("sawGuardRail", (1.45, 0.09, 0.08), (0, 1.15, 0.70), mats["metalLight"], "LOD0", 0.014),
            box("logStop.L", (0.10, 0.34, 0.10), (-0.74, 0.54, 0.96), mats["metal"], "LOD0", 0.014),
            box("logStop.R", (0.10, 0.34, 0.10), (0.74, 0.54, 0.96), mats["metal"], "LOD0", 0.014),
        ]
    elif kind in ("warehouse", "recruitHall"):
        parts += [
            box("cornerPost.L", (0.18, 1.85, 0.18), (-1.36, 1.08, -0.82), mats["woodLight"], "LOD0", 0.025),
            box("cornerPost.R", (0.18, 1.85, 0.18), (1.36, 1.08, -0.82), mats["woodLight"], "LOD0", 0.025),
            prism("frontAwning", [(-0.92, 1.74), (0.92, 1.74), (0.82, 1.52), (-0.82, 1.52)], 0.22, (0, 0, -1.28), mats["darkwood"], "LOD0", 0.025),
        ]
    elif kind == "autoCollector":
        parts += [
            torus("collectorHousing", 0.46, 0.07, (0, 2.34, 0), mats["metalLight"], "LOD0"),
            box("collectorAccess", (0.48, 0.24, 0.06), (0, 1.72, -0.42), mats["glass"], "LOD0", 0.018),
        ]
    elif kind == "autoRebuilder":
        parts += [
            box("rebuilderControl", (0.62, 0.34, 0.10), (0, 1.22, -1.02), mats["dark"], "LOD0", 0.018),
            *(sphere(f"rebuilderButton.{i}", 0.045, (-0.18 + i * 0.18, 1.28, -1.09), mats["glow"]) for i in range(3)),
        ]
    elif kind == "crossbowTower":
        # A proper head assembly: cheek plates, string guides and a bolt
        # magazine make the tower read as a working siege weapon from below.
        parts += [
            prism("crossbowCheek.L", [(-0.44, 1.78), (-0.16, 1.78), (-0.20, 1.40), (-0.48, 1.42)], 0.12, (-0.42, 0, 0.02), mats["metal"], "LOD0", 0.018),
            prism("crossbowCheek.R", [(0.16, 1.78), (0.44, 1.78), (0.48, 1.42), (0.20, 1.40)], 0.12, (0.42, 0, 0.02), mats["metal"], "LOD0", 0.018),
            box("crossbowMagazine", (0.28, 0.18, 0.72), (0, 1.70, -0.30), mats["woodLight"], "LOD0", 0.018),
            *(sphere(f"crossbowBolt.{i}", 0.04, (-0.08 + i * 0.08, 1.82, -0.68), mats["glow"]) for i in range(3)),
            box("crossbowStringGuide", (0.06, 0.06, 0.90), (0, 1.72, -0.42), mats["dark"], "LOD0", 0.008),
            box("crossbowDeckRivet.L", (0.08, 0.08, 0.08), (-0.70, 1.66, -0.72), mats["metalLight"], "LOD0", 0.012),
            box("crossbowDeckRivet.R", (0.08, 0.08, 0.08), (0.70, 1.66, -0.72), mats["metalLight"], "LOD0", 0.012),
        ]
    elif kind == "frostTower":
        parts += [
            prism("frostHousing", [(-0.48, 1.40), (0.48, 1.40), (0.36, 0.88), (-0.36, 0.88)], 0.12, (0, 0, -0.36), mats["stoneDark"], "LOD0", 0.018),
            *(cone(f"frostShard.{i}", 0.10, 0.02, 0.45, ((-0.30 + i * 0.20), 1.70, -0.40), mats["ice"], "LOD0", 6) for i in range(4)),
        ]
    elif kind == "sniperTower":
        parts += [
            box("sniperCounterweight", (0.38, 0.26, 0.55), (0, 3.78, -0.64), mats["metal"], "LOD0", 0.018),
            torus("sniperRangeRing", 0.22, 0.028, (0, 3.84, 0.47), mats["accent"], "LOD0"),
        ]
    elif kind == "mortar":
        parts += [
            box("mortarShield.L", (0.16, 0.72, 0.70), (-0.84, 1.12, -0.18), mats["metal"], "LOD0", 0.018),
            box("mortarShield.R", (0.16, 0.72, 0.70), (0.84, 1.12, -0.18), mats["metal"], "LOD0", 0.018),
            torus("mortarElevationRing", 0.32, 0.035, (0, 1.12, -0.24), mats["metalLight"], "LOD0"),
        ]
    elif kind == "furnace":
        # The furnace is the base's hero prop: deepen the fire chamber with a
        # grate, side buttresses and a service crown that catches the flame
        # light while remaining part of FurnaceRoot.
        parts += [
            prism("furnaceEmberBed", [(-0.52, 1.42), (0.52, 1.42), (0.44, 1.18), (-0.44, 1.18)], 0.06, (0, 0, -1.88), mats["accent"], "LOD0", 0.012),
            *(box(f"furnaceGrate.{i}", (0.055, 0.34, 0.06), (-0.34 + i * 0.23, 1.20, -1.93), mats["metalLight"], "LOD0", 0.008) for i in range(4)),
            box("furnaceButtress.L", (0.30, 1.35, 0.30), (-1.42, 1.12, -0.18), mats["stoneLight"], "LOD0", 0.028),
            box("furnaceButtress.R", (0.30, 1.35, 0.30), (1.42, 1.12, -0.18), mats["stoneLight"], "LOD0", 0.028),
            torus("furnaceServiceCrown", 0.98, 0.05, (0, 2.62, -0.04), mats["metalLight"], "LOD0"),
            sphere("furnaceEmberCore", 0.18, (0, 1.44, -1.96), mats["glow"]),
        ]
    elif kind == "furnace":
        parts += [
            torus("heatRingLower", 1.18, 0.07, (0, 1.05, 0), mats["metalLight"], "LOD0"),
            torus("heatRingUpper", 1.40, 0.06, (0, 2.22, 0), mats["accent"], "LOD0"),
        ]
        for side in (-1, 1):
            parts += [
                box(f"furnacePipe.{side}", (0.11, 1.3, 0.11), (side * 1.18, 1.52, -0.48), mats["metal"], "LOD0", 0.025),
                sphere(f"furnaceValve.{side}", 0.10, (side * 1.18, 1.94, -0.48), mats["glow"]),
            ]


def build_facility(key, cfg):
    reset_scene()
    mats = make_materials(key, cfg)
    root_name = "FurnaceRoot" if cfg["kind"] == "furnace" else "BuildingRoot"
    root = orient_for_babylon(empty(root_name, target="EXPORT", display="CUBE"))
    add_lod_markers(root, "building")
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
        parts += [
            box("derrick.top", (1.9, 0.18, 0.18), (0, 1.75, 0), mats["woodLight"]),
            box("shaftMouth", (1.45, 1.15, 0.5), (0, 0.8, -0.8), mats["dark"]),
            prism("shaftArch", [(-0.78, 0.42), (-0.62, 1.45), (-0.42, 1.58), (0.42, 1.58), (0.62, 1.45), (0.78, 0.42)], 0.12, (0, 0, -1.08), mats["stoneLight"], "LOD0", 0.025),
            cylinder("orePile", 0.55, 0.4, (0.62, 0.4, 0.55), mats["gold" if kind == "goldMine" else "ice"], "LOD0", 7),
        ]
        functional += [box("workPart", (0.85, 0.18, 0.18), (0, 1.35, -0.78), mats["metal"]), sphere("productionCore", 0.16, (0, 1.88, 0), mats["gold" if kind == "goldMine" else "glow"])]
    elif kind == "lumberyard":
        for x in (-1.0, 1.0):
            for z in (-0.8, 0.8): parts.append(box(f"post.{x}.{z}", (0.18, 1.7, 0.18), (x, 0.92, z), mats["wood"]))
        parts += [
            box("roof.left", (2.8, 0.18, 1.0), (0, 1.95, -0.48), mats["darkwood"]),
            box("roof.right", (2.8, 0.18, 1.0), (0, 1.95, 0.48), mats["darkwood"]),
            prism("yardGable", [(-1.3, 1.78), (1.3, 1.78), (0, 2.55)], 0.12, (0, 0, -0.5), mats["woodLight"], "LOD0", 0.025),
            cylinder("sawWheel", 0.1, 1.0, (0, 0.95, 0.72), mats["metal"], "LOD0", 12),
            box("logStack", (2.0, 0.32, 0.4), (0, 0.52, 0.9), mats["wood"]),
        ]
        functional += [empty("workPart", (0, 1.0, 0.7), "EXPORT", "CUBE"), torus("productionCore", 0.34, 0.06, (0, 1.0, 0.72), mats["accent"])]
    elif kind == "warehouse":
        parts += [
            box("warehouseBody", (2.7, 1.8, 2.3), (0, 1.0, 0), mats["wood"]),
            box("door", (1.0, 1.2, 0.12), (0, 0.78, -1.2), mats["darkwood"]),
            prism("warehouseGable", [(-1.46, 1.88), (1.46, 1.88), (0, 2.72)], 0.14, (0, 0, -0.72), mats["woodLight"], "LOD0", 0.03),
            box("roof.left", (3.2, 0.22, 1.55), (0, 2.15, -0.6), mats["darkwood"]),
            box("roof.right", (3.2, 0.22, 1.55), (0, 2.15, 0.6), mats["darkwood"]),
            box("ridge", (3.3, 0.2, 0.2), (0, 2.58, 0), mats["metal"]),
        ]
        parts += [box("crateA", (0.65, 0.65, 0.65), (-1.7, 0.38, 0.6), mats["wood"]), box("crateB", (0.62, 0.62, 0.62), (1.6, 0.35, -0.55), mats["wood"])]
        functional += [box("workPart", (0.7, 0.35, 0.08), (0, 1.75, -1.25), mats["accent"]), sphere("productionCore", 0.12, (0, 1.55, 0), mats["glow"])]
    elif kind == "recruitHall":
        parts += [
            box("hallBody", (2.6, 1.9, 2.2), (0, 1.0, 0), mats["wood"]),
            box("gate", (1.2, 1.35, 0.12), (0, 0.82, -1.16), mats["dark"]),
            prism("hallGable", [(-1.42, 1.9), (1.42, 1.9), (0, 2.8)], 0.15, (0, 0, -0.7), mats["woodLight"], "LOD0", 0.03),
            box("roof", (3.25, 0.24, 2.8), (0, 2.08, 0), mats["darkwood"]),
            cylinder("watchtower", 1.2, 0.85, (0.85, 2.68, 0.4), mats["stone"], "LOD0", 8),
        ]
        for x in (-1.25, 1.25): parts += [cylinder(f"flagPole.{x}", 1.5, 0.05, (x, 1.7, -1.25), mats["metal"], "LOD0", 6), box(f"flag.{x}", (0.45, 0.38, 0.04), (x + 0.2, 2.2, -1.25), mats["accent"])]
        functional += [box("workPart", (1.2, 0.18, 0.1), (0, 1.75, 1.1), mats["metal"]), sphere("productionCore", 0.13, (0, 2.62, 0.4), mats["glow"])]
    elif kind == "autoCollector":
        parts += [
            cylinder("pylon", 2.25, 0.5, (0, 1.25, 0), mats["metal"], "LOD0", 8),
            torus("collectorRingA", 0.85, 0.08, (0, 1.95, 0), mats["accent"]),
            torus("collectorRingB", 1.25, 0.06, (0, 2.35, 0), mats["metal"]),
            prism("collectorGuard", [(-0.72, 1.35), (0.72, 1.35), (0.58, 2.0), (-0.58, 2.0)], 0.12, (0, 0, -0.46), mats["stoneDark"], "LOD0", 0.025),
            box("hopper", (0.7, 0.4, 0.7), (0, 2.7, 0), mats["dark"]),
        ]
        functional += [empty("workPart", (0, 2.05, 0), "EXPORT", "CUBE"), sphere("productionCore", 0.22, (0, 2.7, 0), mats["glow"])]
    elif kind == "autoRebuilder":
        for x in (-0.9, 0.9):
            for z in (-0.9, 0.9): parts.append(box(f"frame.{x}.{z}", (0.18, 2.0, 0.18), (x, 1.15, z), mats["metal"]))
        parts += [
            box("topFrame", (2.2, 0.2, 2.2), (0, 2.3, 0), mats["dark"]),
            prism("repairCrown", [(-0.9, 2.18), (0.9, 2.18), (0.65, 2.72), (-0.65, 2.72)], 0.16, (0, 0, -0.8), mats["accent"], "LOD0", 0.025),
            cylinder("craneCore", 0.65, 0.6, (0, 1.35, 0), mats["accent"], "LOD0", 8),
            box("jib", (0.16, 0.16, 2.5), (0, 2.72, 0.65), mats["metal"]),
        ]
        functional += [empty("workPart", (0, 1.35, 0), "EXPORT", "CUBE"), sphere("productionCore", 0.18, (0, 2.9, 0.0), mats["glow"])]
    elif kind in ("crossbowTower", "frostTower", "sniperTower", "mortar"):
        if kind == "crossbowTower":
            for x in (-0.72, 0.72):
                for z in (-0.72, 0.72): parts.append(box(f"leg.{x}.{z}", (0.18, 1.3, 0.18), (x, 0.85, z), mats["wood"]))
            parts += [
                box("deck", (1.8, 0.16, 1.8), (0, 1.58, 0), mats["wood"]),
                prism("crossbowShield", [(-0.72, 1.72), (0.72, 1.72), (0.52, 1.38), (-0.52, 1.38)], 0.1, (0, 0, -0.65), mats["metal"], "LOD0", 0.03),
                prism("crossbowSkirt", [(-0.82, 1.55), (0.82, 1.55), (0.62, 1.12), (-0.62, 1.12)], 0.12, (0, 0, 0.52), mats["stoneDark"], "LOD0", 0.025),
            ]
            for side in (-1, 1):
                brace = box(f"crossbowBrace.{side}", (0.12, 1.2, 0.12), (side * 0.48, 0.94, 0), mats["metal"], "LOD0", 0.025)
                brace.rotation_euler.z = side * math.pi * 0.18
                parts.append(brace)
            attack_pivot(root, mats, key, "crossbow")
        elif kind == "frostTower":
            parts += [cylinder("spire", 2.1, 0.34, (0, 1.35, 0), mats["ice"], "LOD0", 6), prism("frostSkirt", [(-0.76, 0.72), (0.76, 0.72), (0.6, 1.75), (-0.6, 1.75)], 0.14, (0, 0, -0.5), mats["stoneDark"], "LOD0", 0.025), torus("ring", 0.9, 0.08, (0, 2.25, 0), mats["metal"]), sphere("crystalCore", 0.25, (0, 2.9, 0), mats["glow"])]
            attack_pivot(root, mats, key, "frost")
        elif kind == "sniperTower":
            parts += [cylinder("shaft", 3.2, 0.55, (0, 1.9, 0), mats["stone"], "LOD0", 8), box("deck", (1.6, 0.16, 1.6), (0, 3.7, 0), mats["metal"]), box("railA", (1.6, 0.35, 0.08), (0, 3.95, 0.75), mats["dark"]), box("railB", (1.6, 0.35, 0.08), (0, 3.95, -0.75), mats["dark"]), prism("sniperWindbreak", [(-0.62, 3.84), (0.62, 3.84), (0.52, 3.18), (-0.52, 3.18)], 0.08, (0, 0, -0.72), mats["metal"], "LOD0", 0.025)]
            attack_pivot(root, mats, key, "sniper")
        else:
            parts += [box("cradleL", (0.3, 1.0, 1.6), (-0.9, 0.9, 0), mats["metal"]), box("cradleR", (0.3, 1.0, 1.6), (0.9, 0.9, 0), mats["metal"]), sphere("shellRack", 0.32, (-1.1, 0.65, -0.72), mats["accent"])]
            attack_pivot(root, mats, key, "mortar")
        functional += [sphere("productionCore", 0.13, (0, 2.55, 0), mats["glow"])]
    elif kind == "furnace":
        parts += [
            cylinder("furnaceBody", 1.8, 2.5, (0, 1.0, 0), mats["stone"], "LOD0", 10),
            cylinder("coalBowl", 0.35, 1.5, (0, 2.0, 0), mats["dark"], "LOD0", 10),
            sphere("heatCore", 0.52, (0, 2.05, 0), mats["glow"]),
            torus("furnaceCrown", 1.8, 0.16, (0, 2.8, 0), mats["accent"]),
            prism("furnaceFrontGuard", [(-0.85, 1.76), (0.85, 1.76), (0.62, 0.68), (-0.62, 0.68)], 0.12, (0, 0, -1.58), mats["metal"], "LOD0", 0.04),
            prism("furnaceSnowLip", [(-0.92, 2.48), (0.92, 2.48), (0.8, 2.62), (-0.8, 2.62)], 0.22, (0, 0, 0), mats["snow"], "LOD0", 0.035),
            prism("fireChamberInset", [(-0.58, 1.72), (0.58, 1.72), (0.48, 1.08), (-0.48, 1.08)], 0.08, (0, 0, -1.73), mats["dark"], "LOD0", 0.02),
            prism("fireChamberRim", [(-0.7, 1.8), (0.7, 1.8), (0.58, 0.98), (-0.58, 0.98)], 0.07, (0, 0, -1.79), mats["metal"], "LOD0", 0.018),
            prism("furnaceDoorFrame", [(-0.72, 1.86), (0.72, 1.86), (0.66, 0.82), (-0.66, 0.82)], 0.10, (0, 0, -1.82), mats["stoneLight"], "LOD0", 0.024),
            box("furnaceDoorBar", (0.96, 0.10, 0.10), (0, 1.22, -1.91), mats["metalLight"], "LOD0", 0.018),
            sphere("furnaceDoorHandle", 0.09, (0, 1.22, -1.99), mats["accent"]),
        ]
        # Hand-built masonry courses break the cylinder into a believable
        # load-bearing shell. Small alternating blocks preserve the low-poly
        # budget while giving the furnace a strong hero-prop read.
        for ring, (radius, height) in enumerate(((1.18, 0.72), (1.22, 1.2))):
            for brick in range(10):
                angle = (brick + (0.5 if ring else 0.0)) * math.pi * 0.2
                block = box(f"masonry.{ring}.{brick}", (0.62, 0.28, 0.24), (math.sin(angle) * radius, height, math.cos(angle) * radius), mats["stoneLight"], "LOD0", 0.035)
                block.rotation_euler.y = angle + math.pi * 0.5
                parts.append(block)
        for index, x in enumerate((-0.25, 0.0, 0.25)):
            flame = cone(f"flameTongue.{index}", 0.18 if index == 1 else 0.13, 0.025, 0.48 if index == 1 else 0.34, (x, 1.4 + (0.08 if index == 1 else 0), -1.84), mats["glow"], "LOD0", 6)
            flame.rotation_euler.x = math.pi * 0.5
            parts.append(flame)
        for i in range(4):
            angle = i * math.pi * 0.5
            parts.append(box(f"rune.{i}", (0.12, 0.42, 0.06), (math.sin(angle) * 1.28, 1.1, math.cos(angle) * 1.28), mats["glow"]))
        # The upper furnace silhouette reads as a built chimney, not a single
        # smooth cylinder: alternating cap blocks and a dark flue create a
        # clear heat-exhaust structure from the gameplay camera.
        parts += [
            cylinder("chimneyFlue", 0.72, 1.0, (0, 3.12, 0.02), mats["dark"], "LOD0", 8),
            torus("chimneyCollar", 0.78, 0.08, (0, 3.54, 0.02), mats["metalLight"], "LOD0"),
            cone("chimneyCap", 0.86, 0.62, 0.28, (0, 3.70, 0.02), mats["stoneLight"], "LOD0", 8),
        ]
        for index, angle in enumerate((0.0, math.pi * 0.5, math.pi, math.pi * 1.5)):
            parts.append(box(f"chimneyBlock.{index}", (0.42, 0.26, 0.24), (math.sin(angle) * 0.72, 2.92, math.cos(angle) * 0.72), mats["stoneLight"], "LOD0", 0.025))
        functional += [empty("workPart", (0, 2.05, 0), "EXPORT", "CUBE"), empty("productionCore", (0, 2.05, 0), "EXPORT", "CUBE"), empty("emitter", (0, 2.55, 0), "EXPORT", "PLAIN_AXES")]

    add_facility_finish(parts, kind, mats)
    add_signature_facility_finish(parts, kind, mats)

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

    assign_surface_variants(parts, [
        ("_stone", mats["stoneLight"], mats["stoneDark"]),
        ("_wood", mats["woodLight"], mats["darkwood"]),
        ("_metal", mats["metalLight"], mats["metal"]),
        ("_accent", mats["snow"], mats["accent"]),
    ])
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
