#!/usr/bin/env python3
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
for line in (root / "SHA256SUMS").read_text().splitlines():
    digest, name = line.split("  ", 1)
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name

def raw(folder, name):
    return gzip.decompress((root / "raw" / folder / (name + ".gz")).read_bytes())

def obj(folder, name):
    return json.loads(raw(folder, name))

run = "tenka-map-warning-integrated-28f-c1"
status = obj(run, "status.json")
assert len(status) == 10
assert {s["label"]: s["exitCode"] for s in status} == {
    "focused": 1, "typecheck": 0, "eslint": 0, "data": 0, "assets": 0,
    "build": 0, "bundle": 0, "discovery": 0, "gallery-discovery": 0, "format": 0,
}
before, after = [obj(run, "source-" + phase + ".json") for phase in ("before", "after")]
assert before == after and before["passed"]
assert before["revision"] == "28f1e9084c37d1c68eb01b9328b8eecb5d99d230"
assert len(before["rows"]) == 1646
assert all(r["expectedBlob"] == r["actualBlob"] and r["modeMatches"] for r in before["rows"])
deps = obj(run, "source-before-pixi.json")
assert deps == obj(run, "source-after-pixi.json") and len(deps) == 29
assert all(r["expected"] == r["actual"] for r in deps)
assert b"2 failed | 207 passed (209)" in raw(run, "focused.log")
assert b"buildMapGraph" in raw(run, "focused.log")
assert b"Total: 440 tests in 106 files" in raw(run, "discovery.log")
assert b"Total: 7 tests in 3 files" in raw(run, "gallery-discovery.log")
for name in ("unit-c1", "type-c1", "lint-c1", "format-check-c2"):
    assert obj("tenka-daimyo-fixture-" + name, "result.json")["exitCode"] == 0
assert b"2 passed (2)" in raw("tenka-daimyo-fixture-unit-c1", "stdout-stderr.log")
proof = "tenka-map-warning-correction-proof-c1"
assert raw(proof, "head.stdout").strip() == b"e775a2fec46cb3d60b9a70c5a987b2d85e839390"
assert raw(proof, "changed.stdout") == b"src/ui/screens/DaimyoSelect.spec.tsx\n"
assert not raw(proof, "status.stdout").strip()
source = raw(proof, "fixture-source.tsx")
result = obj(proof, "source-result.json")
assert result["onlyFixtureChanged"]
assert hashlib.sha256(source).hexdigest() == result["sha256"]
blob = hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
assert blob == result["blob"] == raw(proof, "blob.stdout").decode().strip()
print("PASS: hashes; 1646 Git inputs; 29 Pixi targets; preserved 207/2 RED; companion checks; fixture-only correction 2 PASS")
