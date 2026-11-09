#!/usr/bin/env python3
"""Packages the Vite build into installable archives under dist/.

  dist/chromium/  + unfollow-guard-chromium.zip   (Chrome, Brave, Edge, Opera: load the folder unpacked)
  dist/firefox/   + unfollow-guard-firefox.zip    (EXPERIMENTAL, untested: Firefox 140+)

Usage:  python3 scripts/build.py
Run `pnpm run build` instead: it builds the Vite output and the standalone
test/Firefox bundles first. The Firefox package differs in its manifest and
uses the classic IIFE bundles (Firefox has no MV3 service workers).
"""
import json
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
CHROMIUM = DIST / "chromium"
TEST = DIST / "test"


def zip_dir(src: pathlib.Path, out: pathlib.Path) -> None:
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(src.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(src).as_posix())


def main() -> None:
    if not (CHROMIUM / "manifest.json").exists():
        raise SystemExit("dist/chromium is missing; run `pnpm run build` (Vite) first")
    if not (TEST / "background.js").exists() or not (TEST / "content.js").exists():
        raise SystemExit("dist/test is missing; run `node scripts/build-test.mjs` first")

    DIST.mkdir(exist_ok=True)
    shutil.copy2(ROOT / "LICENSE", CHROMIUM / "LICENSE")
    zip_dir(CHROMIUM, DIST / "unfollow-guard-chromium.zip")

    firefox = DIST / "firefox"
    if firefox.exists():
        shutil.rmtree(firefox)
    shutil.copytree(CHROMIUM, firefox)
    shutil.copy2(TEST / "background.js", firefox / "background.js")
    shutil.copy2(TEST / "content.js", firefox / "content.js")

    manifest = json.loads((CHROMIUM / "manifest.json").read_text(encoding="utf-8"))
    manifest["background"] = {"scripts": ["background.js"]}  # Firefox has no MV3 service workers
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": "unfollow-guard@mystic-monk.local",
            "strict_min_version": "140.0",
            # The extension has no server, analytics or accounts: nothing is collected or sent.
            "data_collection_permissions": {"required": ["none"]},
        }
    }
    # Replace CRXJS's async content loader with the self-contained IIFE bundle.
    for entry in manifest.get("content_scripts", []):
        if any("index.ts-loader" in js for js in entry.get("js", [])):
            entry["js"] = ["content.js"]
    manifest.pop("web_accessible_resources", None)
    (firefox / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    zip_dir(firefox, DIST / "unfollow-guard-firefox.zip")

    print("Built:")
    for f in sorted(DIST.glob("*.zip")):
        print(f"  {f.relative_to(ROOT)}  ({f.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
