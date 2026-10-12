#!/usr/bin/env python3
"""Verify the immutable asset-stage observation package without running the game."""

import base64
import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
REVISION = "b1a8fc8b21119bc3e540a6d5c5a83f1bd9911353"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def loaded(name: str):
    with gzip.open(RAW / name, "rt") as stream:
        return json.load(stream)


def result(name: str) -> int:
    return loaded(name)["exitCode"]


def specs(suites):
    for suite in suites:
        for spec in suite.get("specs", []):
            yield suite["file"], spec
        yield from specs(suite.get("suites", []))


manifest = json.loads((ROOT / "raw-manifest.json").read_text())
rows = manifest["rawFiles"]
assert len(rows) == 173
assert len({row["path"] for row in rows}) == len(rows)
assert {row["path"] for row in rows} == {
    str(path.relative_to(RAW)) for path in RAW.rglob("*") if path.is_file()
}
for row in rows:
    data = (RAW / row["path"]).read_bytes()
    assert len(data) == row["bytes"], row["path"]
    assert digest(data) == row["sha256"], row["path"]
expected_sums = "".join(
    f'{row["sha256"]}  raw/{row["path"]}\n' for row in sorted(rows, key=lambda row: row["path"])
)
assert (ROOT / "SHA256SUMS").read_text() == expected_sums

report = loaded("report.json.gz")
analysis = loaded("analysis.json.gz")
assert analysis["revision"] == REVISION
assert report["stats"]["expected"] == analysis["stats"]["expected"] == 14
assert report["stats"]["unexpected"] == analysis["stats"]["unexpected"] == 4
assert report["stats"]["skipped"] == analysis["stats"]["skipped"] == 0
test_specs = list(specs(report["suites"]))
assert len(test_specs) == len(analysis["cases"]) == 18
failures = [
    (file, spec)
    for file, spec in test_specs
    if any(run["status"] == "failed" for test in spec["tests"] for run in test["results"])
]
assert len(failures) == 4
assert sum(file == "army-plate-layout.spec.ts" for file, _ in failures) == 3
assert sum(file == "accessibility.spec.ts" for file, _ in failures) == 1
assert "map renderer 尚未掛載" in next(
    case["error"] for case in analysis["cases"] if case["file"] == "accessibility.spec.ts" and case["status"] == "unexpected"
)

for slug, expected_records in (("sunpu", 295), ("body", 267), ("dense", 288)):
    captured = loaded(f"{slug}-asset-stages.json.gz")
    target = analysis["targets"][slug]
    assert len(captured["trace"]["records"]) == target["recordCount"] == expected_records
    assert captured["trace"]["dropped"] == target["dropped"] == 0
    assert captured["capturedAt"] == target["captureAt"]
    mountain = next(
        value for key, value in target["assets"].items() if key.endswith("castle-branch-mountain-v1.png")
    )
    assert "blob-start" in mountain
    assert "blob-done" not in mountain and "bitmap-start" not in mountain
    attachments = [
        attachment
        for file, spec in failures
        if file == "army-plate-layout.spec.ts"
        for test in spec["tests"]
        for run in test["results"]
        for attachment in run.get("attachments", [])
        if attachment["name"] == "army-asset-stages.json"
    ]
    assert any(json.loads(base64.b64decode(item["body"])) == captured for item in attachments)

for name in ("before", "postbuild", "after"):
    proof = loaded(f"proof-{name}-proof.json.gz")
    assert proof["revision"] == REVISION
    assert (proof["sourceCount"], proof["overlayCount"], proof["dependencyCount"]) == (1650, 5, 29)
    assert proof["bad"] == proof["extraSourceFiles"] == []
    assert result(f"proof-{name}-result.json.gz") == 0
overlay = loaded("observer-manifest-v4.json.gz")
assert overlay["base"] == REVISION and len(overlay["files"]) == 5
assert sum(item["baseSha256"] is None for item in overlay["files"]) == 1
assert digest(gzip.decompress((RAW / "observer-patch-v4.patch.gz").read_bytes())) == overlay["patchSha256"]
assert result("type-red-result.json.gz") == 2
assert "PerformanceEntry" in gzip.decompress((RAW / "type-red-stdout-stderr.log.gz").read_bytes()).decode()
for name in ("type-green", "build", "list"):
    assert result(f"{name}-result.json.gz") == 0
assert result("native-result.json.gz") == 1
listed = gzip.decompress((RAW / "cohort18-list.txt.gz").read_bytes()).splitlines()
assert len(listed) == 18 and all(line.startswith(b"[chromium] > ") for line in listed)

inventory = loaded("browser-inventory.json.gz")["files"]
assert len(inventory) == 53 and sum(item["bytes"] for item in inventory) == 182474517
body_trace = (RAW / "body-trace.zip").read_bytes()
assert any(item["path"].endswith("army-plate-layout-native-a-5ea75--its-plate-survives-far-LOD-chromium/trace.zip") and item["bytes"] == len(body_trace) and item["sha256"] == digest(body_trace) for item in inventory)
assert len(list(RAW.glob("failure-*.md.gz"))) == 4
assert not list(ROOT.rglob("*.ts")) and not list(ROOT.rglob("*.tsx"))
assert manifest["remoteRawBundleSha256"] == "b0876ead8476aa1b72da2043bea2e41a24c89b53851004e6e66c6231c34a6845"
print("PASS: 173 raw hashes, 18 outcomes, 3 attachments, 3 source/dependency proofs, failures, and remote inventory")
