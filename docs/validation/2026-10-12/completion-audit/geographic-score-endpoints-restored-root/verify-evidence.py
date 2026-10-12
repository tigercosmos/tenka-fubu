"""Verify historical root checks and restoration, without executing the game."""

import gzip
import hashlib
import json
import pathlib
import subprocess


base = pathlib.Path(__file__).parent
manifest = json.loads((base / "manifest.json").read_text())
raw = {}
for row in manifest["artifacts"]:
    packed = (base / row["path"]).read_bytes()
    assert len(packed) == row["bytes"]
    assert hashlib.sha256(packed).hexdigest() == row["sha256"]
    content = gzip.decompress(packed)
    assert len(content) == row["uncompressedBytes"]
    assert hashlib.sha256(content).hexdigest() == row["uncompressedSha256"]
    raw[row["path"]] = content
before = json.loads(raw["feab-before-source-inputs.json.gz"])
after = json.loads(raw["restored-source-inputs.json.gz"])
assert before["head"] == "feab20cc9c207f37afae7a2f372c437b93232a07"
assert after["head"] == "45a5384c067e95101ca4d54072e1e66def3f15e7"
assert before["files"] == after["files"]
assert len(after["files"]) == 1494
assert b"24 passed; 0 failed" in raw["candidate-main-rust.log.gz"]
assert b"ACTUAL_HELPER_PARITY_GRID_CASES=1169294" in raw["candidate-main-rust.log.gz"]
assert b"80 passed (80)" in raw["candidate-main-focused.log.gz"]
assert b"11 passed (11)" in raw["candidate-main-focused.log.gz"]
assert b"69af4226d451a71211b209101cc4223045b1aeca2f1178d16e9beaa91166b736" in (
    raw["candidate-main-build.log.gz"]
)
assert b"64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b" in (
    raw["restored-wasm-check.log.gz"]
)
requests = "".join(f'{after["head"]}:{r["path"]}\n' for r in after["files"])
blobs = subprocess.check_output(["git", "cat-file", "--batch"], input=requests.encode())
offset = 0
for row in after["files"]:
    end = blobs.index(b"\n", offset)
    header = blobs[offset:end].decode().split()
    assert header[1] == "blob"
    length = int(header[2])
    content = blobs[end + 1:end + 1 + length]
    assert length == row["bytes"]
    assert hashlib.sha256(content).hexdigest() == row["sha256"], row["path"]
    offset = end + 2 + length
for path in ["public/wasm/tenka_engine.wasm", "public/wasm/manifest.json"]:
    restored = subprocess.check_output(["git", "show", f'{after["head"]}:{path}'])
    reference = subprocess.check_output(["git", "show", f'{before["head"]}:{path}'])
    assert restored == reference, path
print("PASS: original root checks, 1494 historical Git blobs and exact artifact restoration")
print("No new full suite, browser or performance measurement executed.")
