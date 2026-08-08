"""Verify an MPFB installation from inside a real Blender process.

`extension install-file` returning 0 says the archive unpacked. It does not
say the add-on registers, that Blender can import its modules, which version
landed, or what the licence files actually are. Those are separate claims and
each one is checked here, in a background Blender, against the installed
files -- not against the catalogue entry that was downloaded.

    node scripts/run-blender.mjs scripts/blender/mpfb_probe.py

Writes .runtime/mpfb/probe.json and .runtime/mpfb/licence-hashes.json.
"""
import hashlib
import json
import os
import sys
import traceback

import addon_utils
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, ".runtime", "mpfb")
# Licence-bearing filenames worth hashing wherever they turn up in the package.
LICENCE_NAMES = (
    "license", "licence", "license.code", "license.assets", "licence.code",
    "licence.assets", "copying", "notice", "blender_manifest.toml",
)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_package():
    """Locate the installed MPFB package directory and its module name.

    Searched rather than hard-coded: the extension root differs between
    Blender versions and between user/system installs, and an assumption here
    would report a healthy install while pointing at nothing.
    """
    candidates = []
    for module in addon_utils.modules():
        name = module.__name__
        if "mpfb" in name.lower():
            candidates.append((name, os.path.dirname(module.__file__)))
    roots = []
    for base in (bpy.utils.user_resource("EXTENSIONS"), bpy.utils.system_resource("SCRIPTS")):
        if base and os.path.isdir(base):
            roots.append(base)
    for base in roots:
        for dirpath, dirnames, _files in os.walk(base):
            for name in list(dirnames):
                if name.lower() == "mpfb":
                    candidates.append((None, os.path.join(dirpath, name)))
    seen, unique = set(), []
    for name, path in candidates:
        if path not in seen:
            seen.add(path)
            unique.append((name, path))
    return unique


def main():
    os.makedirs(OUT, exist_ok=True)
    report = {
        "blenderVersion": bpy.app.version_string,
        "blenderBinary": bpy.app.binary_path,
        "extensionsUserRoot": bpy.utils.user_resource("EXTENSIONS"),
    }

    packages = find_package()
    report["candidatePaths"] = [{"module": m, "path": p} for m, p in packages]

    module_name, package_dir = (packages[0] if packages else (None, None))
    report["packageDirectory"] = package_dir

    # 1. Is it registered as an add-on Blender knows about?
    enabled_names = []
    for module in addon_utils.modules():
        name = module.__name__
        loaded_default, loaded_state = addon_utils.check(name)
        if "mpfb" in name.lower():
            enabled_names.append({"module": name, "enabledByDefault": loaded_default, "loaded": loaded_state})
    report["addonRegistrations"] = enabled_names
    report["addonPreferencesKeys"] = [k for k in bpy.context.preferences.addons.keys() if "mpfb" in k.lower()]

    # 2. Can Blender actually import it? This is the check `exit 0` cannot make.
    report["import"] = {}
    for candidate in ({e["module"] for e in enabled_names} | {"mpfb"}):
        try:
            module = __import__(candidate, fromlist=["*"])
            report["import"][candidate] = {
                "ok": True,
                "file": getattr(module, "__file__", None),
                "version": str(getattr(module, "VERSION", getattr(module, "bl_info", {}).get("version", ""))),
            }
        except Exception as error:  # noqa: BLE001 - the failure detail is the point
            report["import"][candidate] = {
                "ok": False,
                "error": "%s: %s" % (type(error).__name__, error),
                "traceback": traceback.format_exc().splitlines()[-4:],
            }

    # 3. Manifest, which is where the authoritative version and licence live.
    manifest = None
    if package_dir:
        manifest_path = os.path.join(package_dir, "blender_manifest.toml")
        if os.path.isfile(manifest_path):
            with open(manifest_path, encoding="utf-8") as handle:
                manifest = handle.read()
    report["manifestPresent"] = manifest is not None
    if manifest:
        fields = {}
        for line in manifest.splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, _, value = line.partition("=")
                fields[key.strip()] = value.strip()
        report["manifest"] = {k: fields[k] for k in
                              ("id", "version", "name", "type", "license", "blender_version_min", "maintainer")
                              if k in fields}
        report["manifestRaw"] = manifest[:2000]

    # 4. Licence files and their hashes, from the installed tree.
    licences = []
    if package_dir:
        for dirpath, _dirnames, files in os.walk(package_dir):
            for filename in files:
                stem = os.path.splitext(filename)[0].lower()
                if stem in LICENCE_NAMES or filename.lower() in LICENCE_NAMES:
                    full = os.path.join(dirpath, filename)
                    try:
                        licences.append({
                            "file": os.path.relpath(full, package_dir).replace("\\", "/"),
                            "bytes": os.path.getsize(full),
                            "sha256": sha256(full),
                        })
                    except OSError:
                        continue
    licences.sort(key=lambda row: row["file"])
    report["licenceFiles"] = licences

    # 5. What MakeHuman system assets are present, if any. MPFB ships the code;
    #    the base mesh, targets, rigs, skins and proxies are a separate
    #    download, and without them nothing can be generated.
    asset_report = {}
    if package_dir:
        data_root = os.path.join(os.path.dirname(package_dir), "mpfb", "data")
        for probe in (os.path.join(package_dir, "data"), data_root):
            if os.path.isdir(probe):
                for entry in sorted(os.listdir(probe)):
                    full = os.path.join(probe, entry)
                    if os.path.isdir(full):
                        asset_report[entry] = sum(len(f) for _r, _d, f in os.walk(full))
                break
    report["systemAssetDirs"] = asset_report
    report["hasSystemAssets"] = bool(asset_report) and any(v > 0 for v in asset_report.values())

    report["ok"] = bool(
        report["addonRegistrations"]
        and any(v.get("ok") for v in report["import"].values())
        and report["manifestPresent"]
    )

    with open(os.path.join(OUT, "probe.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with open(os.path.join(OUT, "licence-hashes.json"), "w", encoding="utf-8") as handle:
        json.dump({
            "packageDirectory": package_dir,
            "manifest": report.get("manifest"),
            "licenceFiles": licences,
        }, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("MPFB_PROBE_OK %s" % json.dumps({
        "ok": report["ok"],
        "version": (report.get("manifest") or {}).get("version"),
        "id": (report.get("manifest") or {}).get("id"),
        "imported": [k for k, v in report["import"].items() if v.get("ok")],
        "licenceFiles": len(licences),
        "hasSystemAssets": report["hasSystemAssets"],
    }))
    if not report["ok"]:
        print("MPFB_PROBE_FAILED see .runtime/mpfb/probe.json")
        sys.exit(1)


if __name__ == "__main__":
    main()
