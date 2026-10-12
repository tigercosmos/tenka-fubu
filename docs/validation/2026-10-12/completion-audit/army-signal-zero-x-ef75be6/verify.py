#!/usr/bin/env python3
"""Verify the immutable signal-layout evidence without invoking a browser."""

import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / "manifest.json").read_text())
items = {entry["source"]: entry for entry in manifest["items"]}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def raw(source: str) -> bytes:
    item = items[source]
    compressed = (ROOT / item["file"]).read_bytes()
    assert len(compressed) == item["gzipBytes"]
    assert sha(compressed) == item["gzipSha256"]
    content = gzip.decompress(compressed)
    assert len(content) == item["rawBytes"]
    assert sha(content) == item["rawSha256"]
    return content


for source in items:
    raw(source)
assert len(items) == len(manifest["items"]) == 242
assert manifest["sourceBase"] == "9550e397568ff448689bc5904ec0651b04bfe717"
assert manifest["adoptedCommit"] == "ef75be660e0a142da9c6130ac04ffefc9820e7fb"
assert items["committed-source/src/ui/map/armySignalLayout.ts"]["rawSha256"] == (
    "6271e113276b0891a196848464ad82aad87c760fe7f0b213c0f32e9ae160c4c0"
)
assert items["committed-source/tests/ui/fixtures/armySignalLayoutOriginal.ts"]["rawSha256"] == (
    "c59493b51277a580d2ba75818a37d24cd5c04dc65c206be63f43abf1ec79295b"
)

comparison_bytes = (ROOT / "geometry-comparison.json").read_bytes()
assert sha(comparison_bytes) == manifest["geometryComparisonSha256"]
comparison = json.loads(comparison_bytes)
original = raw("remote-copy/geometry-original/published.json")
candidate = raw("remote-copy/geometry-candidate/published.json")
assert original == candidate
assert comparison["exactBytesEqual"] is True
assert comparison["baselineBytes"] == comparison["candidateBytes"] == len(original)
assert comparison["sha256"] == sha(original)
assert len(comparison["views"]) == 9
assert json.loads(raw("remote-copy/geometry-original/result.json"))["exitCode"] == 0
assert json.loads(raw("remote-copy/geometry-candidate/result.json"))["exitCode"] == 0

close = json.loads(raw("remote-copy/candidate-close/national-close-frames.json"))
assert json.loads(raw("remote-copy/candidate-close/result.json"))["exitCode"] == 1
assert close["measurement"]["durationMs"] >= 30000
assert close["measurement"]["armyCount"] == 120
assert 34.13 < close["measurement"]["averageFps"] < 34.14 < 60
assert "NVIDIA GeForce RTX 5070 Ti" in close["environment"]["renderer"]
assert b"Received:    34.13185007312134" in raw("remote-copy/candidate-close/stdout-stderr.log")

profile = json.loads(raw("remote-copy/candidate-profile/summary.json"))
assert json.loads(raw("remote-copy/candidate-profile/result.json"))["exitCode"] == 0
assert profile["scope"].startswith("separate10secondCPUProfile")
assert profile["measurement"]["durationMs"] >= 10000
assert profile["measurement"]["armyCount"] == 120
assert profile["measurement"]["resourcesBefore"] == profile["measurement"]["resourcesAfter"]

work = json.loads(raw("local-capture/tenka-signal-work-witness-ef75-c2/stdout-stderr.log"))
assert work["old"]["sha256"] == items[
    "committed-source/tests/ui/fixtures/armySignalLayoutOriginal.ts"
]["rawSha256"]
assert work["candidate"]["sha256"] == items[
    "committed-source/src/ui/map/armySignalLayout.ts"
]["rawSha256"]
assert work["old"]["witness"] == work["candidate"]["witness"] == 1000001
assert work["old"]["outputSha256"] == work["candidate"]["outputSha256"]

for run in [
    "tenka-signal-fastpath-bench-955-c1",
    "tenka-signal-fastpath-bench-955-c2",
    "tenka-signal-fastpath-bench-ef75-c3",
    "tenka-signal-fastpath-bench-steady-ef75-c1",
]:
    lines = raw(f"local-capture/{run}/stdout-stderr.log").decode().splitlines()
    assert len(lines) == 3
    assert [json.loads(line)["name"] for line in lines] == [
        "sparse-120x300",
        "crowded-36x70",
        "dense-exhaustion-256x1024",
    ]

for run in [
    "tenka-signal-candidate-baseproof-955-c1",
    "tenka-signal-candidate-overlayproof-955-c1",
    "tenka-signal-candidate-afterproof-955-c1",
    "tenka-signal-candidate-profile-afterproof-955-c1",
]:
    proof = json.loads(raw(f"remote-copy/proofs/{run}/stdout-stderr.log"))
    assert proof["revision"] == manifest["sourceBase"]
    assert proof["sourceCount"] == 1648 and proof["dependencyCount"] == 29
    assert proof["bad"] == []

assert manifest["remoteTrace"]["sha256"] == (
    "f40794e877c61bc902897865aa8c503fbce6c6402d6a6af94797a281c4999638"
)
print("PASS: 242 raw hashes, source/dependency proof, nine-view byte parity, native/profile outcomes, work cap, all benchmark rows")
