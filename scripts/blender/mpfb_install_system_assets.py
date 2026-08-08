"""Install the official MakeHuman system-assets pack into MPFB headlessly.

Usage:
    node scripts/run-blender.mjs scripts/blender/mpfb_install_system_assets.py --zip <archive.zip>

The archive is expected to have been downloaded from the official MakeHuman
asset-pack page and verified separately. This script deliberately does not
download anything; it uses MPFB's own archive checker/extractor and then asks
MPFB whether the modern system pack is actually installed.
"""
import argparse
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, ".runtime", "mpfb", "system-assets")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="mpfb_install_system_assets")
    parser.add_argument("--zip", required=True, dest="archive")
    return parser.parse_args(argv)


def main():
    args = parse_args()
    archive = os.path.abspath(args.archive)
    if not os.path.isfile(archive):
        raise SystemExit("asset-pack archive not found: %s" % archive)

    from bl_ext.blender_org.mpfb.services.assetservice import AssetService
    from bl_ext.blender_org.mpfb.services.locationservice import LocationService

    # MPFB returns None for a normal archive. STRUCTURE/MACOS are explicitly
    # documented as fixable archive layouts and are handled by the same
    # fix_and_extract backend used by the add-on. All other results are fatal.
    check = AssetService.check_asset_pack_zip(archive)
    if check not in (None, "STRUCTURE", "MACOS"):
        raise SystemExit("MPFB rejected asset-pack zip: %s" % check)

    target = LocationService.get_user_data()
    if not target:
        raise SystemExit("MPFB returned no user-data directory")
    os.makedirs(target, exist_ok=True)

    error = AssetService.fix_and_extract_asset_pack_zip(archive, target)
    if error:
        raise SystemExit("MPFB asset-pack extraction failed: %s" % error)

    # Refresh MPFB's caches after extraction. Without this, a process that
    # probed the empty library before installing can keep returning zero assets.
    AssetService.rescan_pack_metadata()
    AssetService.update_all_asset_lists()

    modern, brown = AssetService.check_if_modern_makehuman_system_assets_installed()
    counts = {
        "skins": len(AssetService.get_asset_list("skins", "mhmat")),
        "eyes": len(AssetService.get_asset_list("eyes", "mhclo")),
        "teeth": len(AssetService.get_asset_list("teeth", "mhclo")),
        "eyebrows": len(AssetService.get_asset_list("eyebrows", "mhclo")),
        "eyelashes": len(AssetService.get_asset_list("eyelashes", "mhclo")),
        "hair": len(AssetService.get_asset_list("hair", "mhclo")),
        "clothes": len(AssetService.get_asset_list("clothes", "mhclo")),
        "proxymeshes": len(AssetService.get_asset_list("proxymeshes", "proxy")),
    }
    roots = {
        key: AssetService.get_asset_roots(key)
        for key in ("skins", "eyes", "teeth", "eyebrows", "eyelashes", "hair", "clothes", "proxymeshes")
    }
    ok = bool(modern and counts["skins"] and counts["eyes"] and counts["teeth"])

    report = {
        "archive": archive,
        "archiveBytes": os.path.getsize(archive),
        "archiveSha256": sha256(archive),
        "preflight": check or "OK",
        "targetDir": target,
        "modernSystemAssetsInstalled": bool(modern),
        "brownEyeMaterialInstalled": bool(brown),
        "counts": counts,
        "assetRoots": roots,
        "ok": ok,
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "install-report.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("MPFB_SYSTEM_ASSETS %s" % json.dumps(report, sort_keys=True))
    if not ok:
        raise SystemExit("system assets extracted but MPFB validation is incomplete; see %s" % path)


if __name__ == "__main__":
    main()
