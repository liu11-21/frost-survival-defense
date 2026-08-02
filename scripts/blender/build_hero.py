import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, prism, cylinder, sphere, ellipsoid, empty, collision_box, parent_all, move_to, orient_for_babylon, add_lod_markers, assign_surface_variants, author_surface_paint, cone, torus, save_source, export_glb
from build_units import make_skeleton, bind_unit_pieces, add_armature_clip


def build():
    reset_scene()
    # H5 iteration 2: a cooler cloth/leather split and tighter metal value
    # range improve readability under the night-blue game lighting without
    # changing the established ten-material budget.
    cloth = material("MAT_hero_cloth", (0.16, 0.28, 0.52), 0.84)
    leather = material("MAT_hero_leather", (0.24, 0.09, 0.038), 0.70)
    metal = material("MAT_hero_metal", (0.20, 0.27, 0.36), 0.22, 0.93)
    metal_light = material("MAT_hero_metal_light", (0.52, 0.68, 0.84), 0.14, 0.96)
    skin = material("MAT_hero_skin", (0.68, 0.38, 0.24), 0.80)
    cloth_dark = material("MAT_hero_cloth_dark", (0.06, 0.12, 0.26), 0.88)
    snow = material("MAT_hero_snow", (0.82, 0.93, 1.0), 0.58)
    glow = material("MAT_hero_glow", (0.26, 0.74, 1.0), 0.18, 0.0, (0.16, 0.58, 1.0))
    accent = material("MAT_hero_accent", (0.40, 0.74, 1.0), 0.28, 0.62)
    root = orient_for_babylon(empty("HeroRoot", target="EXPORT", display="PLAIN_AXES"))
    root["commercialStage"] = "H5"
    root["commercialIteration"] = 2
    root["materialReview"] = "cool palette contrast, calibrated emission and regenerated packed brush texture"
    add_lod_markers(root, "character")
    parts = [
        # H1 iteration 1: a wider padded torso, slightly lower centre of
        # mass and a protected head make the silhouette read at gameplay
        # distance while retaining the existing rig and socket contract.
        ellipsoid("body", (0.72, 0.88, 0.45), (0, 1.04, 0), cloth),
        box("coatSkirt", (0.84, 0.28, 0.56), (0, 0.64, -0.02), leather, bevel=0.06),
        box("chestPlate", (0.52, 0.38, 0.08), (0, 1.12, 0.22), metal, bevel=0.045),
        box("chestTrim", (0.52, 0.07, 0.05), (0, 1.28, 0.24), snow, bevel=0.02),
        sphere("head", 0.31, (0, 1.78, 0), skin),
        cone("hood", 0.45, 0.2, 0.32, (0, 2.02, 0), snow, "LOD0", 8),
        torus("hoodRim", 0.31, 0.035, (0, 1.86, 0), snow, "LOD0"),
        box("coatTrim", (0.74, 0.12, 0.46), (0, 1.42, 0), snow, bevel=0.04),
        ellipsoid("arm.L", (0.2, 0.72, 0.21), (-0.52, 1.1, 0), cloth),
        ellipsoid("arm.R", (0.2, 0.72, 0.21), (0.52, 1.1, 0), cloth),
        sphere("glove.L", 0.125, (-0.52, 0.70, 0.02), skin),
        sphere("glove.R", 0.125, (0.52, 0.70, 0.02), skin),
        box("shoulder.L", (0.32, 0.19, 0.32), (-0.50, 1.38, 0), metal, bevel=0.06),
        box("shoulder.R", (0.32, 0.19, 0.32), (0.50, 1.38, 0), metal, bevel=0.06),
        ellipsoid("leg.L", (0.23, 0.7, 0.25), (-0.22, 0.42, 0), leather),
        ellipsoid("leg.R", (0.23, 0.7, 0.25), (0.22, 0.42, 0), leather),
        box("boot.L", (0.27, 0.14, 0.44), (-0.22, 0.07, 0.08), metal, bevel=0.05),
        box("boot.R", (0.27, 0.14, 0.44), (0.22, 0.07, 0.08), metal, bevel=0.05),
        box("belt", (0.74, 0.12, 0.48), (0, 0.82, 0), leather, bevel=0.04),
        box("beltSigil", (0.13, 0.13, 0.05), (0, 0.82, 0.24), glow, bevel=0.02),
        # Faceted profiles break the rectangular silhouette and read as
        # separate garment/armour layers from the normal game camera.
        prism("coatTail", [(-0.38, 1.12), (0.38, 1.12), (0.48, 0.55), (0.18, 0.42), (-0.18, 0.42), (-0.48, 0.55)], 0.08, (0, 0, -0.24), leather, "LOD0", 0.035),
        prism("shoulderMantle", [(-0.62, 1.4), (-0.36, 1.62), (0.36, 1.62), (0.62, 1.4), (0.42, 1.28), (-0.42, 1.28)], 0.28, (0, 0, 0), snow, "LOD0", 0.035),
        prism("scarf", [(-0.34, 1.45), (0.34, 1.45), (0.29, 1.28), (-0.29, 1.28)], 0.46, (0, 0, 0.02), accent, "LOD0", 0.025),
        box("backPack", (0.42, 0.5, 0.24), (0, 1.0, -0.3), leather, bevel=0.055),
        box("backPackCap", (0.48, 0.09, 0.26), (0, 1.25, -0.3), snow, bevel=0.03),
        torus("bracer.L", 0.13, 0.035, (-0.51, 0.93, 0.02), metal, "LOD0"),
        torus("bracer.R", 0.13, 0.035, (0.51, 0.93, 0.02), metal, "LOD0"),
        prism("helmetBrow", [(-0.22, 1.84), (0.22, 1.84), (0.16, 1.68), (-0.16, 1.68)], 0.22, (0, 0, 0.22), leather, "LOD0", 0.02),
        sphere("head.eye.L", 0.045, (-0.095, 1.78, 0.275), glow),
        sphere("head.eye.R", 0.045, (0.095, 1.78, 0.275), glow),
        cone("head.nose", 0.045, 0.012, 0.09, (0, 1.73, 0.30), skin, "LOD0", 6),
        prism("bootToe.L", [(-0.15, 0.17), (0.10, 0.17), (0.11, 0.02), (-0.15, 0.02)], 0.32, (-0.22, 0, 0.17), metal, "LOD0", 0.018),
        prism("bootToe.R", [(-0.10, 0.17), (0.15, 0.17), (0.15, 0.02), (-0.11, 0.02)], 0.32, (0.22, 0, 0.17), metal, "LOD0", 0.018),
        torus("weapon.guard", 0.09, 0.025, (0.62, 0.88, 0.16), accent, "LOD0"),
        prism("sigilPlate", [(-0.14, 1.28), (0.14, 1.28), (0.1, 1.02), (-0.1, 1.02)], 0.06, (0, 0, 0.26), glow, "LOD0", 0.015),
        box("weapon.grip", (0.09, 0.28, 0.09), (0.62, 0.69, 0.16), leather, "LOD0", 0.02),
        cylinder("weapon.blade", 0.055, 1.15, (0.62, 0.86, 0.16), metal, "LOD0", 8),
        sphere("weapon.gem", 0.1, (0.62, 1.44, 0.16), glow),
        prism("lapel.L", [(-0.22, 1.38), (0.02, 1.38), (0.08, 1.08), (-0.18, 1.14)], 0.05, (-0.14, 0, 0.27), accent, "LOD0", 0.015),
        prism("lapel.R", [(-0.02, 1.38), (0.22, 1.38), (0.18, 1.14), (-0.08, 1.08)], 0.05, (0.14, 0, 0.27), accent, "LOD0", 0.015),
    ]
    # Third-pass finish details: a shaped jaw, layered hood seam, coat
    # closures and boot contact pieces give the hero a designed silhouette at
    # the normal gameplay camera instead of a stack of primitives.
    parts += [
        prism("jawGuard", [(-0.16, 1.72), (0.16, 1.72), (0.12, 1.57), (-0.12, 1.57)], 0.08, (0, 0, 0.25), leather, "LOD0", 0.018),
        torus("hoodSeam", 0.33, 0.022, (0, 1.86, 0.01), accent, "LOD0"),
        prism("hoodBack", [(-0.32, 1.98), (0.32, 1.98), (0.25, 1.72), (-0.25, 1.72)], 0.12, (0, 0, -0.19), snow, "LOD0", 0.022),
        box("coatClosure", (0.065, 0.46, 0.045), (0, 1.08, 0.29), accent, "LOD0", 0.012),
        sphere("coatButton.1", 0.035, (0, 1.25, 0.31), glow),
        sphere("coatButton.2", 0.035, (0, 1.08, 0.31), glow),
        prism("beltPouch.L", [(-0.16, 0.92), (0.02, 0.92), (0.03, 0.72), (-0.14, 0.72)], 0.14, (-0.42, 0, -0.01), leather, "LOD0", 0.018),
        prism("beltPouch.R", [(-0.02, 0.92), (0.16, 0.92), (0.14, 0.72), (-0.03, 0.72)], 0.14, (0.42, 0, -0.01), leather, "LOD0", 0.018),
        box("bootSole.L", (0.27, 0.06, 0.44), (-0.2, 0.03, 0.15), metal, "LOD0", 0.02),
        box("bootSole.R", (0.27, 0.06, 0.44), (0.2, 0.03, 0.15), metal, "LOD0", 0.02),
        sphere("bootRivet.L", 0.035, (-0.2, 0.10, 0.27), accent),
        sphere("bootRivet.R", 0.035, (0.2, 0.10, 0.27), accent),
        box("weapon.WrapA", (0.1, 0.055, 0.11), (0.62, 0.70, 0.16), accent, "LOD0", 0.012),
        box("weapon.WrapB", (0.1, 0.055, 0.11), (0.62, 0.80, 0.16), accent, "LOD0", 0.012),
        # A tapered torso shell, split coat tails and articulated guards give
        # the hero a readable human construction instead of a stack of cubes.
        prism("chest.heroShell", [(-0.34, 1.36), (0.34, 1.36), (0.27, 0.94), (0.08, 0.84), (-0.08, 0.84), (-0.27, 0.94)], 0.14, (0, 0, 0.27), metal, "LOD0", 0.028),
        prism("coatTail.L", [(-0.36, 1.06), (-0.04, 1.06), (-0.10, 0.45), (-0.28, 0.34), (-0.50, 0.54)], 0.10, (-0.02, 0, -0.25), cloth_dark, "LOD0", 0.028),
        prism("coatTail.R", [(0.04, 1.06), (0.36, 1.06), (0.50, 0.54), (0.28, 0.34), (0.10, 0.45)], 0.10, (0.02, 0, -0.25), leather, "LOD0", 0.028),
        prism("chest.heroStrap", [(-0.29, 1.34), (-0.20, 1.34), (0.23, 0.92), (0.14, 0.90)], 0.05, (0, 0, 0.35), metal_light, "LOD0", 0.012),
        prism("chest.heroStrapR", [(0.20, 1.34), (0.29, 1.34), (-0.14, 0.90), (-0.23, 0.92)], 0.05, (0, 0, 0.35), metal_light, "LOD0", 0.012),
        prism("head.cheek.L", [(-0.16, 1.76), (-0.04, 1.82), (-0.06, 1.63), (-0.15, 1.66)], 0.08, (0, 0, 0.28), skin, "LOD0", 0.016),
        prism("head.cheek.R", [(0.04, 1.82), (0.16, 1.76), (0.15, 1.66), (0.06, 1.63)], 0.08, (0, 0, 0.28), skin, "LOD0", 0.016),
        prism("head.hoodPanel.L", [(-0.34, 2.06), (-0.06, 2.08), (-0.16, 1.78), (-0.36, 1.86)], 0.12, (0, 0, -0.18), snow, "LOD0", 0.02),
        prism("head.hoodPanel.R", [(0.06, 2.08), (0.34, 2.06), (0.36, 1.86), (0.16, 1.78)], 0.12, (0, 0, -0.18), snow, "LOD0", 0.02),
        prism("leg.L.guard", [(-0.12, 0.52), (0.08, 0.52), (0.10, 0.28), (-0.10, 0.28)], 0.09, (-0.2, 0, 0.22), metal_light, "LOD0", 0.018),
        prism("leg.R.guard", [(-0.08, 0.52), (0.12, 0.52), (0.10, 0.28), (-0.10, 0.28)], 0.09, (0.2, 0, 0.22), metal_light, "LOD0", 0.018),
        prism("weapon.bladeProfile", [(-0.075, 0.18), (0.075, 0.18), (0.10, 0.98), (0.0, 1.22), (-0.10, 0.98)], 0.10, (0.62, 0.0, 0.18), metal_light, "LOD0", 0.014),
        prism("weapon.fuller", [(-0.022, 0.30), (0.022, 0.30), (0.036, 1.02), (0.0, 1.10), (-0.036, 1.02)], 0.018, (0.62, 0.0, 0.235), glow, "LOD0", 0.006),
        sphere("weapon.pommel", 0.08, (0.62, 0.58, 0.16), metal_light),
    ]
    # Fourth-pass hero construction: a fitted chest harness, layered coat
    # pleats and small facial/gauntlet hardware make the protagonist hold up
    # in a close catalogue view instead of reading as a stack of primitives.
    parts += [
        prism("heroHarness.L", [(-0.29, 1.35), (-0.20, 1.35), (0.14, 0.92), (0.06, 0.90)], 0.055, (0, 0, 0.39), metal_light, "LOD0", 0.012),
        prism("heroHarness.R", [(0.20, 1.35), (0.29, 1.35), (-0.06, 0.90), (-0.14, 0.92)], 0.055, (0, 0, 0.39), metal_light, "LOD0", 0.012),
        box("heroHarnessClasp", (0.16, 0.16, 0.06), (0, 1.13, 0.43), accent, "LOD0", 0.016),
        sphere("heroHarnessGem", 0.042, (0, 1.13, 0.47), glow),
        prism("coatPleat.L", [(-0.25, 1.03), (-0.08, 1.03), (-0.14, 0.50), (-0.30, 0.42)], 0.045, (-0.06, 0, -0.31), cloth_dark, "LOD0", 0.012),
        prism("coatPleat.R", [(0.08, 1.03), (0.25, 1.03), (0.30, 0.42), (0.14, 0.50)], 0.045, (0.06, 0, -0.31), cloth_dark, "LOD0", 0.012),
        box("heroHoodLace", (0.035, 0.42, 0.04), (0, 1.60, 0.33), accent, "LOD0", 0.008),
        sphere("heroEyeHighlight.L", 0.014, (-0.095, 1.79, 0.322), snow),
        sphere("heroEyeHighlight.R", 0.014, (0.095, 1.79, 0.322), snow),
        box("gauntletPlate.L", (0.22, 0.18, 0.06), (-0.49, 0.79, 0.16), metal_light, "LOD0", 0.016),
        box("gauntletPlate.R", (0.22, 0.18, 0.06), (0.49, 0.79, 0.16), metal_light, "LOD0", 0.016),
        torus("shoulderRing.L", 0.18, 0.028, (-0.47, 1.40, 0.06), accent, "LOD0"),
        torus("shoulderRing.R", 0.18, 0.028, (0.47, 1.40, 0.06), accent, "LOD0"),
    ]
    # Fifth-pass focal finish: layered cloth edges and weapon hardware give
    # the hero a designed, catalogue-ready silhouette from both front and
    # rear.  These remain rigid pieces on the existing skeleton, so the
    # gameplay animation and authored socket contract are unchanged.
    parts += [
        prism("heroCapePanel.L", [(-0.38, 1.15), (-0.05, 1.08), (-0.18, 0.34), (-0.48, 0.46), (-0.62, 0.78)], 0.08, (-0.04, 0, -0.36), cloth_dark, "LOD0", 0.016),
        prism("heroCapePanel.R", [(0.05, 1.08), (0.38, 1.15), (0.62, 0.78), (0.48, 0.46), (0.18, 0.34)], 0.08, (0.04, 0, -0.36), leather, "LOD0", 0.016),
        prism("heroScarfTail.L", [(-0.20, 1.45), (-0.04, 1.42), (-0.12, 0.92), (-0.28, 1.04)], 0.06, (-0.28, 0, -0.06), accent, "LOD0", 0.012),
        prism("heroScarfTail.R", [(0.04, 1.42), (0.20, 1.45), (0.28, 1.04), (0.12, 0.92)], 0.06, (0.28, 0, -0.06), accent, "LOD0", 0.012),
        box("weapon.crossguard", (0.34, 0.06, 0.07), (0.62, 1.28, 0.16), metal_light, "LOD0", 0.012),
        sphere("weapon.guardGem", 0.045, (0.62, 1.28, 0.21), glow),
        torus("arm.L.forearmRing", 0.11, 0.022, (-0.50, 0.82, 0.03), metal_light, "LOD0"),
        torus("arm.R.forearmRing", 0.11, 0.022, (0.50, 0.82, 0.03), metal_light, "LOD0"),
        prism("chest.heroRib.L", [(-0.25, 1.25), (-0.18, 1.25), (-0.14, 1.00), (-0.22, 1.00)], 0.035, (-0.06, 0, 0.39), accent, "LOD0", 0.008),
        prism("chest.heroRib.R", [(0.18, 1.25), (0.25, 1.25), (0.22, 1.00), (0.14, 1.00)], 0.035, (0.06, 0, 0.39), accent, "LOD0", 0.008),
        box("heroHoodToggle", (0.08, 0.12, 0.06), (0.0, 2.04, -0.23), metal_light, "LOD0", 0.012),
        sphere("heroHoodGem", 0.035, (0.0, 2.04, -0.28), glow),
        # H1 iteration 2: an explicit split back flare prevents the coat from
        # collapsing into one narrow pillar when viewed from the side/rear.
        prism("heroBackFlare.L", [(-0.28, 1.14), (-0.04, 1.08), (-0.18, 0.38), (-0.44, 0.52)], 0.09, (-0.03, 0, -0.43), cloth_dark, "LOD0", 0.018),
        prism("heroBackFlare.R", [(0.04, 1.08), (0.28, 1.14), (0.44, 0.52), (0.18, 0.38)], 0.09, (0.03, 0, -0.43), leather, "LOD0", 0.018),
        # H2 iteration 1: the coat is now constructed from fitted front
        # panels, a raised collar break, and a separate hem band instead of
        # one torso shell.  The offsets leave a deliberate air gap from the
        # chest plate so animation does not produce z-fighting.
        prism("heroJacketFront.L", [(-0.31, 1.35), (-0.03, 1.35), (-0.08, 0.93), (-0.28, 0.95)], 0.07, (-0.02, 0, 0.45), cloth, "LOD0", 0.014),
        prism("heroJacketFront.R", [(0.03, 1.35), (0.31, 1.35), (0.28, 0.95), (0.08, 0.93)], 0.07, (0.02, 0, 0.45), cloth, "LOD0", 0.014),
        prism("heroCollar.L", [(-0.28, 1.43), (-0.02, 1.43), (-0.09, 1.30), (-0.24, 1.30)], 0.08, (-0.01, 0, 0.46), snow, "LOD0", 0.014),
        prism("heroCollar.R", [(0.02, 1.43), (0.28, 1.43), (0.24, 1.30), (0.09, 1.30)], 0.08, (0.01, 0, 0.46), snow, "LOD0", 0.014),
        box("heroHemBand", (0.68, 0.075, 0.06), (0, 0.88, 0.43), accent, "LOD0", 0.012),
        torus("heroCuff.L", 0.135, 0.025, (-0.53, 0.78, 0.08), accent, "LOD0"),
        torus("heroCuff.R", 0.135, 0.025, (0.53, 0.78, 0.08), accent, "LOD0"),
        # H2 iteration 2: the second pass separates the side construction
        # from the front panels and adds a visible hem rhythm/hood lining.
        prism("heroJacketSide.L", [(-0.34, 1.29), (-0.26, 1.26), (-0.30, 0.90), (-0.39, 0.96)], 0.06, (-0.28, 0, 0.23), cloth_dark, "LOD0", 0.012),
        prism("heroJacketSide.R", [(0.26, 1.26), (0.34, 1.29), (0.39, 0.96), (0.30, 0.90)], 0.06, (0.28, 0, 0.23), leather, "LOD0", 0.012),
        prism("heroHemPleat.L", [(-0.31, 0.91), (-0.19, 0.91), (-0.22, 0.58), (-0.35, 0.54)], 0.055, (-0.04, 0, 0.20), cloth_dark, "LOD0", 0.010),
        prism("heroHemPleat.R", [(0.19, 0.91), (0.31, 0.91), (0.35, 0.54), (0.22, 0.58)], 0.055, (0.04, 0, 0.20), leather, "LOD0", 0.010),
        torus("heroHoodLining", 0.335, 0.018, (0, 1.88, 0.03), accent, "LOD0"),
        box("heroSeamPiping", (0.04, 0.56, 0.035), (0, 1.10, 0.49), snow, "LOD0", 0.008),
        # H3 iteration 1: identity shapes are deliberately placed on the
        # camera-facing silhouette, not hidden inside the hood volume.
        prism("heroVisor", [(-0.22, 1.87), (0.22, 1.87), (0.17, 1.70), (-0.17, 1.70)], 0.08, (0, 0, 0.36), cloth_dark, "LOD0", 0.012),
        prism("heroFaceMark", [(-0.045, 1.77), (0.045, 1.77), (0.06, 1.61), (0, 1.56), (-0.06, 1.61)], 0.025, (0, 0, 0.39), glow, "LOD0", 0.008),
        prism("heroHoodCrest", [(-0.10, 2.08), (0, 2.22), (0.10, 2.08), (0.05, 1.98), (-0.05, 1.98)], 0.07, (0, 0, -0.22), accent, "LOD0", 0.012),
        prism("heroShoulderInsignia.L", [(-0.11, 1.48), (0.11, 1.48), (0.07, 1.34), (-0.07, 1.34)], 0.035, (-0.50, 0, 0.20), glow, "LOD0", 0.008),
        prism("heroShoulderInsignia.R", [(-0.11, 1.48), (0.11, 1.48), (0.07, 1.34), (-0.07, 1.34)], 0.035, (0.50, 0, 0.20), glow, "LOD0", 0.008),
        # H3 iteration 2: a shallow lens, mask bridge and one-sided hood pin
        # create a memorable asymmetry without adding an extra material.
        prism("heroVisorLens", [(-0.14, 1.82), (0.14, 1.82), (0.11, 1.75), (-0.11, 1.75)], 0.025, (0, 0, 0.415), glow, "LOD0", 0.006),
        box("heroMaskBridge", (0.07, 0.15, 0.035), (0, 1.69, 0.42), metal_light, "LOD0", 0.008),
        prism("heroHoodPin", [(-0.06, 2.12), (0.10, 2.16), (0.07, 2.02), (-0.08, 2.03)], 0.04, (0.24, 0, -0.22), metal_light, "LOD0", 0.008),
        prism("heroShoulderBadge", [(-0.13, 1.52), (0.13, 1.52), (0.11, 1.36), (-0.11, 1.36)], 0.045, (-0.50, 0, 0.235), accent, "LOD0", 0.010),
        sphere("heroBadgeGem", 0.035, (-0.50, 1.44, 0.27), glow),
        # H4 iteration 1: the hero carries a readable melee blade and a
        # compact ranged assembly.  Both are authored meshes so the runtime
        # sockets have a visible, testable destination.
        box("weapon.rangedBody", (0.18, 0.44, 0.16), (0.38, 1.18, -0.20), leather, "LOD0", 0.025),
        torus("weapon.rangedGuard", 0.13, 0.022, (0.38, 1.18, -0.29), metal_light, "LOD0"),
        cylinder("weapon.rangedBarrel", 0.035, 0.48, (0.38, 1.42, -0.20), metal, "LOD0", 8),
        box("weapon.rangedSight", (0.05, 0.10, 0.05), (0.38, 1.39, -0.20), glow, "LOD0", 0.008),
        sphere("weapon.rangedMuzzle", 0.045, (0.38, 1.67, -0.20), glow),
        # H4 iteration 2: edge strips and a visible stock/bolt finish the
        # ranged silhouette while socket guides document the attachment axes.
        prism("weapon.bladeEdge.L", [(-0.086, 0.26), (-0.02, 0.28), (0.0, 1.16), (-0.035, 1.02)], 0.035, (0.62, 0, 0.255), accent, "LOD0", 0.006),
        prism("weapon.bladeEdge.R", [(0.02, 0.28), (0.086, 0.26), (0.035, 1.02), (0.0, 1.16)], 0.035, (0.62, 0, 0.255), accent, "LOD0", 0.006),
        box("weapon.rangedStock", (0.20, 0.16, 0.20), (0.38, 0.96, -0.20), leather, "LOD0", 0.018),
        cylinder("weapon.rangedBolt", 0.016, 0.36, (0.38, 1.58, -0.20), metal_light, "LOD0", 6),
        torus("weapon.socketGuide.R", 0.07, 0.012, (0.62, 0.78, 0.20), glow, "LOD0"),
        torus("weapon.socketGuide.ranged", 0.06, 0.010, (0.38, 1.34, -0.20), glow, "LOD0"),
    ]
    assign_surface_variants(parts, [
        ("_cloth", snow, cloth),
        ("_leather", accent, leather),
        ("_metal", metal_light, metal),
        ("_accent", snow, accent),
    ])
    glow_shader = glow.node_tree.nodes.get("Principled BSDF")
    if glow_shader and glow_shader.inputs.get("Emission Strength"):
        glow_shader.inputs["Emission Strength"].default_value = 2.6
    author_surface_paint(parts, seed=53, textured=True)
    parent_all(parts, root)
    skeleton = make_skeleton(root)
    skeleton.name = "HeroSkeleton"
    skeleton.data.name = "HeroSkeleton"
    bind_unit_pieces(parts, skeleton)
    socket_positions = {
        "weapon_socket.R": (0.62, 0.78, 0.20),
        "weapon_socket.L": (-0.50, 0.82, 0.16),
        "ranged_socket": (0.38, 1.34, -0.20),
        "back_socket": (0.0, 1.08, -0.48),
    }
    for name, position in socket_positions.items():
        socket = empty(name, position, "RIG")
        socket["socketKind"] = "ranged" if name == "ranged_socket" else "weapon"
        socket["forwardAxis"] = "+Y"
        socket["contractVersion"] = "hero-h4"
        socket.parent = root
    collision_box("COL_Hero", (0.82, 1.9, 0.82), (0, 0.95, 0), root)
    add_armature_clip(skeleton, "Idle", 24, [(1, {}), (12, {"chest": (0.025, 0, 0), "head": (0, 0.025, 0)}), (24, {})])
    add_armature_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.35, 0, 0), "upper_arm.R": (-0.35, 0, 0), "thigh.L": (-0.5, 0, 0), "thigh.R": (0.5, 0, 0)}),
        (8, {"upper_arm.L": (-0.35, 0, 0), "upper_arm.R": (0.35, 0, 0), "thigh.L": (0.5, 0, 0), "thigh.R": (-0.5, 0, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Run", 18, [
        (1, {"upper_arm.L": (0.65, 0, 0), "upper_arm.R": (-0.65, 0, 0), "thigh.L": (-0.75, 0, 0), "thigh.R": (0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (6, {"upper_arm.L": (-0.65, 0, 0), "upper_arm.R": (0.65, 0, 0), "thigh.L": (0.75, 0, 0), "thigh.R": (-0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (18, {}),
    ])
    add_armature_clip(skeleton, "MeleeAttack", 16, [(1, {"upper_arm.R": (-1.0, 0, 0), "lower_arm.R": (-0.6, 0, 0)}), (7, {"upper_arm.R": (1.4, 0, 0), "lower_arm.R": (0.5, 0, 0), "chest": (0.2, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "RangedAttack", 16, [(1, {"upper_arm.R": (-0.8, 0, 0), "upper_arm.L": (-0.5, 0, 0)}), (8, {"upper_arm.R": (-1.7, 0, 0), "upper_arm.L": (-1.1, 0, 0), "head": (-0.15, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "Hit", 12, [(1, {"chest": (-0.2, 0, 0), "head": (0.12, 0, 0)}), (12, {})])
    add_armature_clip(skeleton, "Death", 20, [(1, {}), (12, {"root": (1.25, 0, 0), "chest": (0.4, 0, 0), "upper_arm.L": (0.8, 0, 0), "upper_arm.R": (0.8, 0, 0)}), (20, {"root": (1.45, 0, 0), "chest": (0.5, 0, 0), "upper_arm.L": (1.1, 0, 0), "upper_arm.R": (1.1, 0, 0)})])
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", "hero.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
