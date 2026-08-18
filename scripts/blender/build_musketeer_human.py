"""Build the Musketeer from the shared human pipeline, end to end and headless.

The same three stages the Warrior and the Shield use, and nothing authored by
hand in a .blend:

    body        mpfb_human_variants.py --variant musketeer
    kit         hero_outfit.py --kit musketeer_outfit
    production  human_source_adapter.py --ally-contract

The `musketeer` macro is the TALLEST and NARROWEST of the four, which is the
opposite pole from the Shield, and the adapter is told 1.80 m.

ONE carried item, unlike the Shield's two: a musket, rigid to hand_l. It is a
two-handed weapon carried single-handed on purpose -- `rigid_weights` puts an
object entirely on one bone, and splitting a firearm's weights between two
hands turns a rigid object into a rubber one.

The LEFT hand, and the first asset here to use it. MeleeAttack is the only
asymmetric clip in the set (0.117 m of left-hand travel against 0.753 m of
right) and it was the only clip that ever collided; the support-hand carry
removes the problem and frees the right hand for the butt-stroke that clip
actually plays. The adapter reads the grip bone off the weapon's own weights,
so the three right-handed characters are unaffected.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RUNTIME = os.path.join(ROOT, ".runtime", "mpfb", "variants")

ENV = {
    # Fitting is settled: drop the body faces the kit permanently hides.
    "HERO_OUTFIT_CULL": "1",
    # Every tier must keep the garments, the gloves and the axe. The adapter
    # refuses to write a candidate that lost one to the LOD pass.
    "HERO_REQUIRE_GARMENTS": "1",
    "HUMAN_REQUIRE_PARTS": "HeroOutfit,HeroGlove_l,HeroGlove_r,HeroSword",
}

STAGES = [
    ("body", ["scripts/blender/mpfb_human_variants.py",
              "--variant", "musketeer", "--name", "musketeer_base"]),
    ("kit", ["scripts/blender/hero_outfit.py",
             "--input", os.path.join(RUNTIME, "musketeer_base.glb"),
             "--variant", "musketeer", "--kit", "musketeer_outfit",
             "--name", "musketeer_dressed"]),
    ("production", ["scripts/blender/human_source_adapter.py",
                    "--input", os.path.join(RUNTIME, "musketeer_dressed.glb"),
                    "--profile", "mpfb2-game-engine",
                    "--name", "musketeer_candidate",
                    "--height", "1.80", "--material-budget", "3",
                    # Ordinary-unit caps are 7500 / 3200 / 1100 triangles. The
                    # adapter's default leaves LOD0 undecimated, which only a
                    # protagonist can afford; these land all three inside, at
                    # 7444 / 3152 / 1073. Tuned down from 0.78 as the musket
                    # gained a one-piece stock and the coat gained the rings
                    # that closed the hip -- the source mesh grew, so the
                    # ratios had to shrink to hold the same budget.
                    "--lod-ratio", "0.756,0.313,0.092",
                    # Musket motion for the two clips whose meaning the
                    # weapon changes; the other five retarget unaltered.
                    "--clip-authors", "musketeer_clips",
                    "--legacy-bones",
                    "--ally-contract"]),
]


def main():
    for label, argv in STAGES:
        print("MUSKETEER_STAGE %s" % label, flush=True)
        environment = dict(os.environ)
        environment.update(ENV)
        result = subprocess.run(
            ["node", "scripts/run-blender.mjs"] + argv, cwd=ROOT, env=environment)
        if result.returncode != 0:
            raise SystemExit("stage %s failed (%d)" % (label, result.returncode))
    print("MUSKETEER_PIPELINE_OK")


if __name__ == "__main__":
    sys.exit(main())
