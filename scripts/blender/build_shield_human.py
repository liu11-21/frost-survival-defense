"""Build the Shield from the shared human pipeline, end to end and headless.

Three stages, the same three the Warrior uses, and nothing here is authored by
hand in a .blend:

    body        mpfb_human_variants.py --variant shield
    kit         hero_outfit.py --kit shield_outfit
    production  human_source_adapter.py --ally-contract

The `shield` macro is the shortest and broadest of the three characters, and
the adapter is told 1.68 m. Width comes from the kit: a straight knee-length
coat, squared pauldrons and a door shield, not from scaling the body, because
a body scaled wide deforms at the shoulder the moment an arm swings.

HUMAN_REQUIRE_PARTS names HeroCarried_1 as well as HeroSword. The shield is a
SECOND carried mesh -- `rigid_weights` puts an object entirely on one bone, so
a shield on the left forearm and a sidearm in the right hand cannot be one
object -- and a decimation ratio tuned for a 6000-face body will happily
delete a prop. Requiring it by name is what makes the adapter refuse a
candidate that lost the shield in the LOD pass.
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
    "HUMAN_REQUIRE_PARTS": "HeroOutfit,HeroGlove_l,HeroGlove_r,HeroSword,HeroCarried_1",
}

STAGES = [
    ("body", ["scripts/blender/mpfb_human_variants.py",
              "--variant", "shield", "--name", "shield_base"]),
    ("kit", ["scripts/blender/hero_outfit.py",
             "--input", os.path.join(RUNTIME, "shield_base.glb"),
             "--variant", "shield", "--kit", "shield_outfit",
             "--name", "shield_dressed"]),
    ("production", ["scripts/blender/human_source_adapter.py",
                    "--input", os.path.join(RUNTIME, "shield_dressed.glb"),
                    "--profile", "mpfb2-game-engine",
                    "--name", "shield_candidate",
                    "--height", "1.68", "--material-budget", "3",
                    # Ordinary-unit caps are 7500 / 3200 / 1100 triangles. The
                    # adapter's default leaves LOD0 undecimated, which only a
                    # protagonist can afford; these land all three inside.
                    # Lower than the Warrior's 0.82/0.335/0.100. The helm starts at the
                    # brow rather than reaching down over the face, so the cull no
                    # longer deletes the head faces it used to hide, and LOD0 came
                    # out at 8999 against a 7500 cap.
                    "--lod-ratio", "0.66,0.272,0.077",
                    "--legacy-bones",
                    "--ally-contract"]),
]


def main():
    for label, argv in STAGES:
        print("WARRIOR_STAGE %s" % label, flush=True)
        environment = dict(os.environ)
        environment.update(ENV)
        result = subprocess.run(
            ["node", "scripts/run-blender.mjs"] + argv, cwd=ROOT, env=environment)
        if result.returncode != 0:
            raise SystemExit("stage %s failed (%d)" % (label, result.returncode))
    print("WARRIOR_PIPELINE_OK")


if __name__ == "__main__":
    sys.exit(main())
