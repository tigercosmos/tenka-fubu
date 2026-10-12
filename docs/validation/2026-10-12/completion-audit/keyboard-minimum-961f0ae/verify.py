#!/usr/bin/env python3
"""Verify the captured minimum-viewport keyboard evidence."""

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


def archive(name: str, expected_sha: str) -> dict[str, bytes]:
    data = (HERE / name).read_bytes()
    assert sha256(data) == expected_sha, name
    with tarfile.open(HERE / name, "r:gz") as packed:
        return {member.name.lstrip("./"): packed.extractfile(member).read()
                for member in packed if member.isfile()}


packed = {name: archive(name, digest) for name, digest in MANIFEST["archives"].items()}
current = packed["sim4-current-metadata.tar.gz"]
old = packed["sim4-old-control-metadata.tar.gz"]
local = packed["local-capture-metadata.tar.gz"]


def outcome(files: dict[str, bytes], run: str) -> int:
    return json.loads(files[f"{run}/result.json"])["exitCode"]


for run, code in MANIFEST["currentOutcomes"].items():
    assert outcome(current, f"runs/{run}") == code, run
for run, code in MANIFEST["oldOutcomes"].items():
    assert outcome(old, f"old-control-runs/{run}") == code, run
for run, code in MANIFEST["localOutcomes"].items():
    assert outcome(local, run) == code, run

report = json.loads(current["runs/keyboard-full-v9/report.json"])
tests = [test for suite in report["suites"] for spec in suite["specs"]
         for test in spec["tests"]]
assert len(tests) == 6
assert all(len(test["results"]) == 1 and test["results"][0]["status"] == "passed"
           for test in tests)
assert not report["errors"]

pairs = []
for test in tests:
    for item in test["results"][0].get("attachments", []):
        if item["name"] == "settled-camera-inputs":
            pairs.extend(json.loads(base64.b64decode(item["body"])))
assert [pair["key"] for pair in pairs] == MANIFEST["cameraKeys"]
assert all(re.fullmatch(r"[0-9a-f]{64}", pair["before"]) and
           re.fullmatch(r"[0-9a-f]{64}", pair["after"]) and
           pair["before"] != pair["after"] for pair in pairs)

old_log = old["old-control-runs/keyboard-old-router-red-v3/stdout-stderr.log"].decode()
assert "Expected: 0" in old_log and "Received: 1" in old_log
assert "await page.keyboard.press('m')" in old_log or "minimum viewport rail" in old_log
assert "尚有未存檔的進度" in current["runs/keyboard-final-v7/stdout-stderr.log"].decode()

proof = current["runs/test-source-proof-v9/stdout-stderr.log"].decode()
for path, digest in MANIFEST["remoteSourceSha256"].items():
    assert f"{digest}  {path}" in proof, path
git_source = subprocess.check_output(
    ["git", "show", "934163c:e2e/keyboard-minimum.spec.ts"], cwd=REPO
)
assert sha256(git_source) == MANIFEST["committedTestSha256"]
assert sha256((REPO / "e2e/keyboard-minimum.spec.ts").read_bytes()) == MANIFEST["committedTestSha256"]
old_proof = local["old-router-git-proof/stdout-stderr.log"].decode().splitlines()
assert [line.split()[0] for line in old_proof] == MANIFEST["oldRouterGitProofSha256"]
post_overlay = old["old-control-runs/post-overlay-source-proof/stdout-stderr.log"].decode()
for path, digest in MANIFEST["oldControlLaterReadbackSha256"].items():
    assert f"{digest}  {path}" in post_overlay, path

trace_hashes = current["runs/trace-inventory/stdout-stderr.log"].decode().splitlines()
trace_sizes = current["runs/trace-sizes/stdout-stderr.log"].decode().splitlines()
assert sorted(trace_hashes) == sorted(
    f"{item['sha256']}  {item['path']}" for item in MANIFEST["externalTraces"]
)
assert sorted(trace_sizes) == sorted(
    f"{item['bytes']} {item['path']}" for item in MANIFEST["externalTraces"]
)

print(f"PASS: {len(tests)} browser cases, {len(pairs)} distinct settled camera pairs")
print("PASS: old-router RED, captured failures, scoped and full GREEN runs")
print("PASS: archive, source, dependency, and external-trace inventory hashes")
