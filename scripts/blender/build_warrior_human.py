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

STATUS -- this is the pipeline, not the finished character
----------------------------------------------------------
Stage 2 currently points at hero_outfit.py, which dresses the Warrior in the
HERO's coat and sword. That is a pipeline smoke test and nothing more: it
proves the three stages connect and produce a rigged, LOD'd, animated GLB. It
is NOT the Warrior design and must not be shipped as one -- the silhouette
would be the Hero's, which is the one thing the brief rules out.

The Warrior kit (hood framing the face, short padded jacket instead of the long
coat, tabard, heavy bracers, no sword) is the next piece of work and lives in a
warrior_outfit.py that does not exist yet.

Known integration gap, carried deliberately
-------------------------------------------
human_source_adapter.py emits `UnitRoot` and `LOD{n}_PROD_*`, which the ally
asset contract wants, but not the rest of it: the manifest requires
`UnitSkeleton`, `weapon_socket`, `attackAnchor`, `upper_grip`, `lower_grip`,
`axe_tip` and nodes literally named `LOD1`/`LOD2`. The adapter names its
armature `Human.rig` and exports no weapon locators, because nothing on the
human path has ever needed them.

So an MPFB-derived warrior.glb is NOT yet a drop-in replacement for the
existing procedural one. Closing that is asset-pipeline work in the adapter
(emit the locators from the rig's hand bones and alias the armature name); it
requires no change to SquadManager, combat or any gameplay code, and none is
proposed here.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RUNTIME = os.path.join(ROOT, ".runtime", "mpfb", "variants")

STAGES = [
    ("body", ["scripts/blender/mpfb_human_variants.py",
              "--variant", "warrior", "--name", "warrior_base"]),
    # See STATUS above: this is the Hero kit, used as a smoke test only.
    ("kit", ["scripts/blender/hero_outfit.py",
             "--input", os.path.join(RUNTIME, "warrior_base.glb"),
             "--variant", "male", "--name", "warrior_dressed"]),
    ("production", ["scripts/blender/human_source_adapter.py",
                    "--input", os.path.join(RUNTIME, "warrior_dressed.glb"),
                    "--profile", "mpfb2-game-engine",
                    "--name", "warrior_candidate",
                    "--height", "1.70", "--material-budget", "6"]),
]


def main():
    for label, argv in STAGES:
        print("WARRIOR_STAGE %s" % label, flush=True)
        result = subprocess.run(
            ["node", "scripts/run-blender.mjs"] + argv, cwd=ROOT)
        if result.returncode != 0:
            raise SystemExit("stage %s failed (%d)" % (label, result.returncode))
    print("WARRIOR_PIPELINE_OK")


if __name__ == "__main__":
    sys.exit(main())
