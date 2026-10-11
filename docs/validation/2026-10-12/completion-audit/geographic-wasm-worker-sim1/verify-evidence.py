"""Verify immutable compatibility evidence; do not rerun or modify the game."""

import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPECTED = "2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df"


def raw(name):
    return gzip.decompress((HERE / name).read_bytes())


def read(name):
    return json.loads(raw(name))


def verify():
    manifest = json.loads((HERE / "manifest.json").read_text())
    for row in manifest["files"]:
        data = (HERE / row["path"]).read_bytes()
        assert len(data) == row["bytes"]
        assert hashlib.sha256(data).hexdigest() == row["sha256"]
        if row["path"].endswith(".gz"):
            assert hashlib.sha256(gzip.decompress(data)).hexdigest() == row["rawSha256"]
    binaries = [raw(name) for name in ["mac-tenka_engine.wasm.gz", "linux-tenka_engine.wasm.gz", "served-tenka_engine.wasm.gz"]]
    assert binaries[0] == binaries[1] == binaries[2]
    assert len(binaries[0]) == 27147
    assert hashlib.sha256(binaries[0]).hexdigest() == EXPECTED
    assert raw("mac-wasm-manifest.json.gz") == raw("linux-wasm-manifest.json.gz")
    runtime = read("runtime-dependency-proof.json.gz")
    assert runtime["wasm"]["engineABI"] == runtime["wasm"]["geographicABI"] == 1
    assert runtime["lockSha256"] == "63f021d39b353a70831accbfc50b714a09767b900ce23157fbf4ecce1dda7be1"
    assert runtime["pixiVersion"] == "8.19.0" and len(runtime["patchRows"]) == 23
    assert all(row["sha256"] == row["expectedPatchedSha256"] for row in runtime["patchRows"])
    assert '"validated":23,"written":23' in raw("npm-ci.log.gz").decode()
    source = read("source-verification.json.gz")
    assert source["commit"] == manifest["runtimeCommit"]
    assert source["checkedFiles"] == 2814 and source["mismatches"] == []
    report = read("report-2f146aecbcd2c5b32fbb.json.gz")
    assert [test["results"][0]["status"] for test in report["tests"]] == ["failed"] + ["passed"] * 5
    assert all(len(test["results"]) == 1 and test["results"][0]["retry"] == 0 for test in report["tests"])
    for name in ["worker-pending-save-reload-reference.json.gz", "native-worker-cancel-generation-parity.json.gz"]:
        pair = read(name)
        assert pair["actual"] == pair["reference"]["state"]
        assert pair.get("actualLog", pair.get("log")) == pair["reference"]["log"]
    cancellation = read("native-worker-cancel-generation-parity.json.gz")["cancelled"]
    assert cancellation["posted"]["pendingTicks"] == 1
    assert cancellation["after"]["pendingTicks"] == 0
    assert cancellation["after"]["generation"] > cancellation["before"]["generation"]
    assert cancellation["after"]["completedWorkerTicks"] == cancellation["before"]["completedWorkerTicks"]
    for days in [60, 120]:
        pair = read(f"same-host-{days}-day-worker-responsiveness.json.gz")
        assert pair["states"][0] == pair["states"][1]
        assert pair["logs"][0] == pair["logs"][1]
        assert pair["states"][0]["time"]["day"] == days + 1
    paced = read("normal-x5-worker-paced-sync-responsiveness.json.gz")
    assert paced["states"][0] == paced["states"][1] and paced["logs"][0] == paced["logs"][1]
    assert [row["completedDays"] for row in paced["rows"]] == [29, 29]
    assert [state["time"]["day"] for state in paced["states"]] == [30, 30]
    initial = read("failed-snapshot-call@26.json.gz")
    queued = read("failed-snapshot-call@30.json.gz")
    final = read("failed-snapshot-call@50.json.gz")
    assert initial == queued and initial["time"]["day"] == 0 and final["time"]["day"] == 3
    assert read("failed-decoded-call@32.json.gz")["entries"] == []
    assert read("failed-decoded-call@52.json.gz")["finalDay"] == 3
    traffic = read("failed-decoded-call@54.json.gz")
    assert traffic["created"] == 4 and [message["requestId"] for message in traffic["sent"]] == [1, 2, 3, 4]
    assert len(traffic["received"]) == 3
    assert all(message["kind"] == "complete" and message["backend"] == "rust-wasm" and message["inconsistentThreatTotals"] == [] for message in traffic["received"])
    diagnostics = read("failed-decoded-call@56.json.gz")
    assert diagnostics["generation"] == 4 and diagnostics["completedWorkerTicks"] == 3
    assert diagnostics["pendingTicks"] == 0 and diagnostics["wasmLoaded"] is False
    assert diagnostics["pathfinderBackend"] is None
    print("PASS: identical cross-platform/served binary, 23 patches, all five parity cases; original current-epoch readiness RED retained")


if __name__ == "__main__":
    verify()
