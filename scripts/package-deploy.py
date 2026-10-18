"""Package verified prebuilt assets, not training data/environments or account config."""
import hashlib
import json
import subprocess
import zipfile
import argparse
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="sanzaru-onnx-deploy.zip")
    parser.add_argument("--allow-stale-page-report", metavar="REASON",
                        help="Package with the previous passing page test, recording why it was not rerun")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+\.zip", args.name):
        parser.error("Use a lowercase ZIP filename without directories")
    subprocess.run(["node", "scripts/check-deploy.mjs"], cwd=ROOT, check=True)
    model_report = json.loads((ROOT / "docs/testing/asl-model-validation.json").read_text())
    browser_report = json.loads((ROOT / "docs/testing/asl-browser-validation.json").read_text())
    if not browser_report.get("passed") or browser_report["modelSha256"] != model_report["modelSha256"]:
        raise SystemExit("A passing browser report for the exported model is required")
    if browser_report.get("manifest") != model_report.get("manifest") or not browser_report.get("isolated"):
        raise SystemExit("Browser report must cover the current manifest with cross-origin isolation")
    page_report = json.loads((ROOT / "docs/testing/asl-production-page.json").read_text())
    if not page_report.get("passed") or not page_report.get("clientChunks"):
        raise SystemExit("Test the actual /lab and /play buttons with tests/asl-production-page.mjs first")
    if any(run.get("productionModelId") != page_report["pages"]["/lab"]["modelId"] for run in browser_report["runs"]):
        raise SystemExit("Browser and actual-page tests must load the same model configuration")
    stale_chunks = []
    for filename, digest in page_report["clientChunks"].items():
        path = ROOT / "dist/client/_next/static/chunks" / filename
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            stale_chunks.append(filename)
    if stale_chunks and not (args.allow_stale_page_report or "").strip():
        raise SystemExit("Production-page browser report is stale; rerun it or explicitly record a release exception")
    packaging_report = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "modelSha256": model_report["modelSha256"],
        "deployAssetChecksPassed": True,
        "modelBrowserReportPassed": True,
        "productionPageReportMatchesBuild": not stale_chunks,
        "productionPageReportCreatedAt": page_report.get("createdAt"),
        "stalePageReportChunks": stale_chunks,
        "pageRetestException": args.allow_stale_page_report if stale_chunks else None,
        "currentCameraChunks": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted((ROOT / "dist/client/_next/static/chunks").glob("camera-panel-*.js"))
        },
    }
    selected = []
    for folder in ("dist/client", "dist/server", "drizzle"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and path.name not in ("wrangler.json", "wrangler.local.json") and ".vite" not in path.parts:
                selected.append(path)
    for filename in ("wrangler.production.example.jsonc", "DEPLOY-THIS-BUNDLE-TH.md", "MODEL-REPORT-TH.md", "TESTING.md",
                     "ONNX-RUNTIME-WEB-TH.md", "ASL-SETUP-TH.md", "DEPLOY-CLOUDFLARE-TH.md", "RELEASE_NOTES.md", "vendor/onnxruntime-LICENSE.txt",
                     "docs/testing/asl-model-validation.json", "docs/testing/asl-browser-validation.json", "docs/testing/asl-real-browser.png",
                     "WORKER-URL-FIX-TH.md", "docs/testing/asl-production-page.json", "docs/testing/asl-production-play.png",
                     "PERFORMANCE-ASL-TH.md", "docs/testing/asl-model-validation-640.json", "docs/testing/asl-browser-validation-640.json",
                     "docs/testing/asl-browser-single-thread.json", "docs/testing/asl-browser-before-performance.json",
                     "docs/testing/asl-distance-diagnostic-384.json"):
        selected.append(ROOT / filename)
    selected = sorted(set(selected))
    output_dir = ROOT / "release"
    output_dir.mkdir(exist_ok=True)
    archive = output_dir / args.name
    checksums = []
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in selected:
            relative = path.relative_to(ROOT).as_posix()
            content = path.read_bytes()
            checksums.append(f"{hashlib.sha256(content).hexdigest()}  {relative}")
            bundle.writestr(relative, content)
        content = (json.dumps(packaging_report, indent=2) + "\n").encode("utf-8")
        checksums.append(f"{hashlib.sha256(content).hexdigest()}  PACKAGING-REPORT.json")
        bundle.writestr("PACKAGING-REPORT.json", content)
        bundle.writestr("SHA256SUMS.txt", "\n".join(checksums) + "\n")
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise SystemExit("Archive verification failed")
        for line in checksums:
            digest, filename = line.split("  ", 1)
            assert hashlib.sha256(bundle.read(filename)).hexdigest() == digest
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Verified {len(checksums)} file checksums: {archive} ({archive.stat().st_size:,} bytes)\nSHA-256: {digest}")


if __name__ == "__main__":
    main()
