"""Check stored standalone arithmetic-probe evidence; do not run the probe."""

import gzip
import hashlib
import json
import pathlib


base = pathlib.Path(__file__).parent
manifest = json.loads((base / "manifest.json").read_text())
raw = {}
for row in manifest["artifacts"]:
    packed = (base / row["path"]).read_bytes()
    assert len(packed) == row["bytes"], row["path"]
    assert hashlib.sha256(packed).hexdigest() == row["sha256"], row["path"]
    content = gzip.decompress(packed)
    assert len(content) == row["uncompressedBytes"], row["path"]
    assert hashlib.sha256(content).hexdigest() == row["uncompressedSha256"]
    raw[row["path"]] = content

summary = json.loads((base / "summary.json").read_text())
assert summary == json.loads(raw["parity.log.gz"])
assert summary["allEqual"] is True
assert summary["cases"] == 871200
assert summary["rows"] == 660
assert summary["nans"] == 248374
assert summary["zeros"] == 505908
assert summary["negativeZeros"] == 0
assert len(raw["probe.wasm.gz"]) == summary["wasmBytes"] == 884
assert hashlib.sha256(raw["probe.wasm.gz"]).hexdigest() == summary["sha256"]
assert summary["resultStreamSha256"] == (
    "c55ccf321fd09221faf16ed7435299bb50c7a160e9883057dcb32eb09a68f368"
)
provenance = json.loads(raw["provenance.json.gz"])
assert hashlib.sha256(raw["original-geographic.rs.gz"]).hexdigest() == (
    provenance["originalSourceSha256"]
)
assert provenance["normalizedScalarBodiesMatch"] is True
assert provenance["buildExit"] == provenance["parityExit"] == 0
assert provenance["f64MinimumStableProbeExit"] == 1
assert b"error[E0658]" in raw["minimum-probe-red.log.gz"]
assert b"float_minimum_maximum" in raw["minimum-probe-red.log.gz"]
assert b"rustc 1.97.1" in raw["toolchain.log.gz"]
print("PASS: 10 dual-SHA artifacts, original probe output counts and preserved RED")
print("No build, arithmetic replay, browser or performance measurement executed.")
