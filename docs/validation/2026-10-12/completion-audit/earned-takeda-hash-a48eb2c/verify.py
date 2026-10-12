#!/usr/bin/env python3
"""Verify the compact Takeda FNV evidence and its recorded limits."""

import hashlib
import io
import json
from pathlib import Path
import tarfile


ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / "manifest.json").read_text())
archive_path = ROOT / manifest["raw_archive"]["path"]
archive_bytes = archive_path.read_bytes()
assert len(archive_bytes) == manifest["raw_archive"]["bytes"]
assert hashlib.sha256(archive_bytes).hexdigest() == manifest["raw_archive"]["sha256"]

with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
    names = {member.name for member in archive if member.isfile()}
    assert names == set(manifest["files"]), (len(names), len(manifest["files"]))
    content = {}
    for name, expected in manifest["files"].items():
        data = archive.extractfile(name).read()
        assert len(data) == expected["bytes"], name
        assert hashlib.sha256(data).hexdigest() == expected["sha256"], name
        content[name] = data


def raw(name):
    return content[name].decode()


def metric(name, marker):
    lines = [line.split(marker, 1)[1] for line in raw(name).splitlines() if marker in line]
    assert len(lines) == 1, (name, marker, len(lines))
    return json.loads(lines[0])


control_log = "tenka-takeda-census-read-b1-c1/stdout-stderr.log"
candidate_log = "tenka-takeda-limb-route-read-b1-c1/stdout-stderr.log"
benchmark_log = "tenka-takeda-limb-benchmark-read-b1-c1/stdout-stderr.log"
control = metric(control_log, "TAKEDA_CENSUS ")
candidate = metric(candidate_log, "TAKEDA_CENSUS ")
benchmark = metric(benchmark_log, "FNV_COMPOSITE ")
for name, value in [(control_log, control), (candidate_log, candidate)]:
    assert "Test Files  1 passed (1)" in raw(name), name
    assert value["buckets"]["dailyHash"]["count"] == 300, name
    assert value["buckets"]["commandHash"]["count"] == 60, name
    assert value["buckets"]["evidenceBytes"]["count"] == 25263056, name
assert control["callbackWallMs"] > candidate["callbackWallMs"]
assert control["buckets"]["dailyHash"]["ms"] > candidate["buckets"]["dailyHash"]["ms"]
assert benchmark["repeats"] == 12
assert benchmark["day"] == 300
assert len(benchmark["times"]["legacy"]) == len(benchmark["times"]["limb"]) == 12
assert "Test Files  1 passed (1)" in raw(benchmark_log)

paths = [
    "tenka-takeda-census-output-hash-b1-c1/stdout-stderr.log",
    "tenka-takeda-limb-output-hash-b1-c1/stdout-stderr.log",
    "tenka-takeda-census-old-output-hash-b1-c1/stdout-stderr.log",
]
outputs = [json.loads(raw(path)) for path in paths]
for output in outputs:
    by_size = {entry["size"]: entry["sha256"] for entry in output.values()}
    assert by_size == {
        868744: "f58901048b720abfcb012f3e22f0264b21f537c0a22ebd29d215332f04438d41",
        25263056: "a80e52e2db2842cb234d6e547bec9115e3bf7340770b0d878e89f34fb30a7fe6",
    }

for name in [
    "tenka-takeda-census-preproof-b1-c1",
    "tenka-takeda-census-postproof-b1-c1",
    "tenka-takeda-limb-preproof-b1-c1",
    "tenka-takeda-limb-route-preproof-b1-c1",
    "tenka-takeda-limb-postroute-proof-b1-c1",
]:
    proof = json.loads(raw(f"{name}/stdout-stderr.log"))
    assert proof["passed"] and proof["entries"] == 1650 and not proof["bad"]
    assert not proof["extras"] and not proof["missing"]
    assert len(proof["dependencies"]) == 29
    assert all(row["expected"] == row["actual"] for row in proof["dependencies"])

assert "exact frozen functions and source SHA verified" in raw(
    "tenka-fnv-fixture-verify-b1-c1/stdout-stderr.log"
)
assert '"checked":67766' in raw("tenka-takeda-fnv-differential-b1-c1/stdout-stderr.log")
for name in [
    "tenka-takeda-census-outer-b1-c1",
    "tenka-takeda-limb-route-outer-b1-c1",
    "tenka-takeda-limb-benchmark-outer-b1-c1",
]:
    assert json.loads(raw(f"{name}/result.json"))["exitCode"] == 0

print(
    json.dumps(
        {
            "passed": True,
            "rawFiles": len(content),
            "controlCallbackMs": control["callbackWallMs"],
            "candidateCallbackMs": candidate["callbackWallMs"],
            "dailyHashesEach": 300,
            "benchmarkPairs": 12,
            "serializedOutputsEqual": True,
        },
        sort_keys=True,
    )
)
