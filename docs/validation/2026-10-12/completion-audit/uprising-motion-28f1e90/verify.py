#!/usr/bin/env python3
"""Verify the compact uprising-motion evidence without rerunning a browser."""

import base64
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
lines = (root / "SHA256SUMS").read_text().splitlines()
for line in lines:
    digest, name = line.split("  ", 1)
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == digest, f"SHA mismatch: {name}"


def report(name):
    with gzip.open(root / name, "rt") as stream:
        return json.load(stream)


def cases(name):
    data = report(name)
    return [test for suite in data["suites"] for spec in suite["specs"] for test in spec["tests"]]


def attachment(test, name):
    for result in test["results"]:
        for item in result["attachments"]:
            if item["name"] == name:
                return json.loads(base64.b64decode(item["body"]))
    raise AssertionError(f"missing attachment {name}")


old = cases("old-semantic-report.json.gz")
assert len(old) == 1 and old[0]["status"] == "unexpected"
assert "Expected: false" in (root / "old-semantic.log").read_text()
assert "Received: true" in (root / "old-semantic.log").read_text()
final = cases("final-candidate-report.json.gz")
assert len(final) == 2
assert all(test["status"] == "expected" for test in final)
assert "blinks" in report("final-candidate-report.json.gz")["suites"][0]["specs"][1]["title"]
semantic = final[1]
witness = attachment(semantic, "uprising-witness")
assert witness["target"] == witness["effectsTarget"]
for key, expected in (("initial", True), ("initialAfterScreenshot", True),
                      ("hidden", False), ("hiddenAfterScreenshot", False),
                      ("reduced", True), ("effectsOff", True)):
    value = witness[key]
    assert value["warningVisible"] is expected and value["districtVisible"] is True
    assert value["warningLayerSeparated"] is True
    assert "NVIDIA" in value["renderer"] and "Vulkan" in value["renderer"]
assert witness["reducedSamples"] == [True] * 6
assert witness["effectsOffSamples"] == [True] * 6
assert witness["gameSha256"] == witness["effectsGameSha256"]
assert witness["commandsSha256"] == witness["effectsCommandsSha256"]

for name in ("candidate-source-proof-before.log", "candidate-source-proof-after.log"):
    proof = json.loads((root / name).read_text())
    assert proof["revision"] == "cb717d2466a21daa29aa15843c0de22abb8b91ce"
    assert proof["sourceCount"] == 1641 and proof["dependencyCount"] == 29
    assert proof["bad"] == []
    assert len(proof["overlay"]) == 4
assert (root / "candidate-source-proof-before.log").read_bytes() == (
    root / "candidate-source-proof-after.log"
).read_bytes()
with gzip.open(root / "source-manifest.json.gz", "rt") as stream:
    assert json.load(stream)["revision"] == "cb717d2466a21daa29aa15843c0de22abb8b91ce"
with gzip.open(root / "dependency-baseline.json.gz", "rt") as stream:
    assert len(json.load(stream)["dependencies"]) == 29

inventory = (root / "raw-runs-sha256.txt").read_text().splitlines()
assert len(inventory) == 164
assert all("/tmp/tenka-district-warning-cb717d2-v1/runs/" in row for row in inventory)
print("PASS: compact SHA table, original RED, final 2/2, target/GPU witness, source/deps proofs, remote raw inventory")
