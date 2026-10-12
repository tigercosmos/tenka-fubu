#!/usr/bin/env python3
"""Verify the captured Battle control acceptance run and its source pins."""

import base64
import hashlib
import json
import re
import subprocess
import tarfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
MANIFEST = json.loads((HERE / "manifest.json").read_text())


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unpack(name: str) -> dict[str, bytes]:
    archive = HERE / name
    assert sha256(archive.read_bytes()) == MANIFEST["archives"][name], name
    with tarfile.open(archive, "r:gz") as packed:
        return {
            member.name.lstrip("./"): packed.extractfile(member).read()
            for member in packed
            if member.isfile()
        }


remote = unpack("sim4-runs.tar.gz")
local = unpack("local-captures.tar.gz")


def exit_code(files: dict[str, bytes], run: str) -> int:
    return json.loads(files[f"{run}/result.json"])["exitCode"]


for run, code in MANIFEST["remoteOutcomes"].items():
    assert exit_code(remote, f"runs/{run}") == code, run
for run, code in MANIFEST["localOutcomes"].items():
    assert exit_code(local, run) == code, run


def results(run: str):
    report = json.loads(remote[f"runs/{run}/report.json"])
    tests = [test for suite in report["suites"] for spec in suite["specs"]
             for test in spec["tests"]]
    return report, tests


baseline, baseline_tests = results("battle-scale-baseline-v2")
assert len(baseline_tests) == 15 and not baseline["errors"]
assert all(test["results"][0]["status"] == "passed" for test in baseline_tests)

failed, failed_tests = results("battle-controls-v3")
assert len(failed_tests) == 16
assert sum(test["results"][0]["status"] == "failed" for test in failed_tests) == 2
assert "scrollHeight" in remote["runs/battle-controls-v3/stdout-stderr.log"].decode()

diagnostic, diagnostic_tests = results("battle-title-diagnostic-v4")
assert len(diagnostic_tests) == 1 and diagnostic_tests[0]["results"][0]["status"] == "failed"
attachments = diagnostic_tests[0]["results"][0]["attachments"]
geometry = json.loads(base64.b64decode(next(
    item["body"] for item in attachments if item["name"] == "battle-control-geometry"
)))
view = base64.b64decode(next(
    item["body"] for item in attachments if item["name"] == "battle-high-scale-view"
))
assert view.startswith(b"\x89PNG\r\n\x1a\n")
assert geometry["title"]["overflowY"] == "visible"
assert geometry["title"]["text"]["y"] >= geometry["header"]["y"]
assert geometry["title"]["text"]["y"] + geometry["title"]["text"]["height"] <= 72
assert geometry["title"]["scrollHeight"] > geometry["title"]["clientHeight"] + 1

prior_final, prior_tests = results("battle-controls-final-v5")
assert len(prior_tests) == 16 and not prior_final["errors"]
assert all(test["results"][0]["status"] == "passed" for test in prior_tests)
final, final_tests = results("battle-controls-final-v6")
assert len(final_tests) == 16 and not final["errors"]
assert all(test["results"][0]["status"] == "passed" for test in final_tests)
final_titles = [spec["title"] for suite in final["suites"] for spec in suite["specs"]]
scales = []
for title, test in zip(final_titles, final_tests):
    match = re.search(r"UI scale (\d+(?:\.\d+)?)$", title)
    if not match:
        assert "native controls keep Space" in title
        continue
    scale = float(match.group(1))
    scales.append(scale)
    item = next(item for item in test["results"][0]["attachments"]
                if item["name"] == "battle-control-geometry")
    data = json.loads(base64.b64decode(item["body"]))
    assert data["documentWidth"] <= 1281 and data["bodyWidth"] <= 1281
    assert data["field"]["width"] > 0 and data["field"]["height"] > 0
    assert data["title"]["overflowY"] == "visible"
    assert data["title"]["text"]["y"] >= data["header"]["y"] - 1
    assert data["title"]["text"]["y"] + data["title"]["text"]["height"] <= 73
    assert all(button["width"] >= 32 and button["height"] >= 32
               for button in data["headerButtons"])
    assert all(button["y"] >= -1 and button["y"] + button["height"] <= 721
               for button in data["headerButtons"] + data["tacticButtons"])
assert scales == [round(0.8 + 0.05 * index, 2) for index in range(15)]

source_proof = remote["runs/final-source-proof-v6/stdout-stderr.log"].decode()
for path, digest in MANIFEST["sourceSha256"].items():
    assert f"{digest}  {path}" in source_proof, path
test_bytes = subprocess.check_output(
    ["git", "show", f"{MANIFEST['testCommit']}:e2e/battle-controls-acceptance.spec.ts"],
    cwd=REPO,
)
assert sha256(test_bytes) == MANIFEST["sourceSha256"]["e2e/battle-controls-acceptance.spec.ts"]

inventory = remote["runs/trace-inventory/stdout-stderr.log"].decode().splitlines()
sizes = {}
hashes = {}
for line in inventory:
    value, path = line.split(maxsplit=1)
    if re.fullmatch(r"[0-9a-f]{64}", value):
        hashes[path] = value
    else:
        sizes[path] = int(value)
assert len(sizes) == len(hashes) == 3
for path, size in sizes.items():
    member = "runs/" + path.split("/runs/", 1)[1]
    data = remote[member]
    assert len(data) == size and sha256(data) == hashes[path]

print("PASS: 15 real Battle UI scales at 1280x720 and one native keyboard case")
print("PASS: preserved false-oracle failures, diagnostic image, and complete traces")
print("PASS: archive, source, dependency, and final test hashes")
