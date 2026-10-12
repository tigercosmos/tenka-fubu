#!/usr/bin/env python3
"""Verify the compact StrictMode SystemMenu evidence package without network access."""

import gzip
import hashlib
import json
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BASE = "5febce974ee2c6b2f3e9203aad535fe28590d6a8"
OVERLAYS = {
    "src/ui/screens/SystemMenu.tsx": "07973f2ce00485751d514a0e40a0354e8c4ed2a86840c2963636cd531a85e95b",
    "src/ui/screens/SystemMenuStrictMode.spec.tsx": "e251422bd6fe74a7306080316ff48918cafeaf509757101b4eee706c5805d070",
    "tests/browser/systemMenuOwnerProbe.pw.ts": "083600bdddbcc06aa7923a7ff93251943f47d84fbc22a95eb222210ea330f511",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def members(name: str) -> dict[str, bytes]:
    with tarfile.open(ROOT / "raw" / name, "r:gz") as archive:
        return {
            member.name: archive.extractfile(member).read()
            for member in archive.getmembers()
            if member.isfile()
        }


for line in (ROOT / "SHA256SUMS").read_text().splitlines():
    digest, rel = line.split("  ", 1)
    assert sha((ROOT / rel).read_bytes()) == digest, rel

source = members("source-support.tar.gz")
remote = members("remote-runs.tar.gz")
local = members("local-captures.tar.gz")
manifest = json.loads(gzip.decompress(source["source/base-manifest.json.gz"]))
deps = json.loads(gzip.decompress(source["source/dependency-baseline.json.gz"]))
assert manifest["revision"] == BASE
assert len(manifest["entries"]) == 1646
assert len(deps["dependencies"]) == 29
assert sha(source["source/candidate-SystemMenu.tsx"]) == OVERLAYS["src/ui/screens/SystemMenu.tsx"]
assert sha(source["source/SystemMenuStrictMode.spec.tsx"]) == OVERLAYS[
    "src/ui/screens/SystemMenuStrictMode.spec.tsx"
]
assert sha(source["source/candidate-probe.pw.ts"]) == OVERLAYS[
    "tests/browser/systemMenuOwnerProbe.pw.ts"
]


def captured_proof(name: str) -> dict:
    output = local[f"{name}/stdout-stderr.log"].decode()
    proof = json.loads(output)
    assert proof["revision"] == BASE
    assert proof["sourceCount"] == 1646
    assert proof["dependencyCount"] == 29
    assert proof["overlay"] == OVERLAYS
    assert proof["bad"] == []
    assert proof["nodeModulesTarget"] == "/tmp/tenka-combined-linux-5f250eb/node_modules"
    assert json.loads(local[f"{name}/result.json"])["exitCode"] == 0
    return proof


for name in (
    "tenka-system-menu-candidate-source-before-v1",
    "tenka-system-menu-build-postproof-v1",
    "tenka-system-menu-candidate-source-after-v1",
):
    captured_proof(name)


def result(name: str, expected: str) -> dict:
    prefix = f"remote-runs/{name}/"
    report = json.loads(remote[prefix + "report.json"])
    results = [
        entry
        for suite in report["suites"]
        for spec in suite["specs"]
        for test in spec["tests"]
        for entry in test["results"]
    ]
    assert len(results) == 1, name
    assert results[0]["status"] == expected, name
    assert json.loads(remote[prefix + "result.json"])["exitCode"] == (0 if expected == "passed" else 1)
    assert prefix + "command.json" in remote
    assert prefix + "stdout-stderr.log" in remote
    return json.loads(remote.get(prefix + "owner-transitions.json", b"{}"))


result("ordinary-native-v2", "passed")
result("ordinary-candidate-native-v1", "passed")
old = result("gallery-probe-native-v1", "failed")
new = result("gallery-candidate-native-v1", "passed")
assert old["visible"] is False and new["visible"] is True
assert old["coreUnchanged"] and old["commandsUnchanged"]
assert new["coreUnchanged"] and new["commandsUnchanged"]


def modal_sequence(observation: dict) -> list[str | None]:
    return [row["modal"] for row in observation["records"] if row["cause"] == "ui-store"]


assert modal_sequence(old)[:3] == [None, "systemMenu", None]
assert modal_sequence(new)[:2] == [None, "systemMenu"]
assert new["records"][-1]["modal"] == "systemMenu"
samples = new["effectsOffSamples"]
assert len(samples) == 6
assert all(row["active"] and row["visible"] and row["separated"] for row in samples)
assert all("NVIDIA" in row["renderer"] and "Vulkan" in row["renderer"] for row in samples)

original_unit = local["tenka-system-menu-strict-unit-old-v1/stdout-stderr.log"].decode()
final_unit = local["tenka-system-menu-captured-callback-v1/stdout-stderr.log"].decode()
assert "1 failed | 1 passed" in original_unit
assert "6 passed" in final_unit
assert json.loads(local["tenka-system-menu-strict-unit-old-v1/result.json"])["exitCode"] == 1
assert json.loads(local["tenka-system-menu-captured-callback-v1/result.json"])["exitCode"] == 0
trace_inventory = local["tenka-system-menu-original-trace-hash-v1/stdout-stderr.log"].decode()
assert "c387c99275a48e76346b4e15716f38a81158cc13d6916d6e7676d17396dbda58" in trace_inventory
assert "trace.zip 60265479" in trace_inventory
print("PASS: package hashes, source/deps proofs, original RED and two candidate native PASS cases")
