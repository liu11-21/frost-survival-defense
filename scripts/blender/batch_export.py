import os
import runpy


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("build_hero.py", "build_turret.py", "build_wall_gate.py", "build_units.py", "build_buildings.py", "build_resources.py"):
        runpy.run_path(os.path.join(here, name), run_name="__main__")


if __name__ == "__main__":
    main()
