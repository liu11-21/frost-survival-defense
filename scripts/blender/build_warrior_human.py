"""Warrior V1 pipeline driver: MPFB body -> warrior kit -> production GLB.

Reproducible by construction: every stage is a script in this directory driven
by `scripts/run-blender.mjs`, so a rebuild needs no GUI, no manual step and no
saved .blend to start from. Run it and the same bytes come out.

    node scripts/run-blender.mjs scripts/blender/build_warrior_human.py

Why the Warrior shares the Hero's human base
--------------------------------------------
Both are MPFB bodies on the `game_engine` rig, which is what makes them
animation-compatible with each other and with the existing ally clips. The
difference has to come from build and kit, not from a different base mesh: the
`warrior` macro in mpfb_human_variants.py is shorter (1.70 m against the Hero's
1.84 m), heavier and broader, so infantry reads as infantry beside the Hero
even before either is dressed.

Stages
------
    MPFB warrior body -> warrior_outfit -> ally production adapter -> GLB

All headless and script-driven: no hand edits to a .blend anywhere in the
chain, so a clean rebuild reproduces the shipped candidate.

    node scripts/run-blender.mjs scripts/blender/build_warrior_human.py

The kit stage runs hero_outfit.py as the shared PIPELINE with `--kit
warrior_outfit`, which swaps the garment set and the palette. It briefly ran
without that flag as a smoke test, which dressed the Warrior in the Hero's coat
and sword while reporting success -- the flag is not optional.

`HERO_OUTFIT_CULL` removes body faces the garments permanently hide. It is off
by default during fitting, because a garment that swallows the torso would have
the evidence deleted along with it; here the fit is settled and the hidden
faces are pure cost.

The adapter runs with `--ally-contract`, without which the export carries no
UnitSkeleton, no weapon locators and no LOD marker nodes, and is not a drop-in
for the procedural warrior.glb.
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
              "--variant", "warrior", "--name", "warrior_base"]),
    ("kit", ["scripts/blender/hero_outfit.py",
             "--input", os.path.join(RUNTIME, "warrior_base.glb"),
             "--variant", "warrior", "--kit", "warrior_outfit",
             "--name", "warrior_dressed"]),
    ("production", ["scripts/blender/human_source_adapter.py",
                    "--input", os.path.join(RUNTIME, "warrior_dressed.glb"),
                    "--profile", "mpfb2-game-engine",
                    "--name", "warrior_candidate",
                    "--height", "1.70", "--material-budget", "5",
                    # Ordinary-unit caps are 7500 / 3200 / 1100 triangles. The
                    # adapter's default leaves LOD0 undecimated, which only a
                    # protagonist can afford; these land all three inside.
                    "--lod-ratio", "0.82,0.335,0.100",
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
