"""Verify archived regression bytes and the fixed-source inventories."""

import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
summary = json.loads((root / "summary.json").read_text())
for row in summary["artifacts"]:
    packed = (root / row["path"]).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == row["bytes"]
    assert hashlib.sha256(packed).hexdigest() == row["sha256"]
    assert len(raw) == row["rawBytes"]
    assert hashlib.sha256(raw).hexdigest() == row["rawSha256"]

inventories = []
for name in ("source-before.json.gz", "source-after.json.gz"):
    data = json.loads(gzip.decompress((root / name).read_bytes()))
    assert data["head"] == summary["source"]
    assert data["passed"]
    assert len(data["rows"]) == summary["sourceInputs"]
    assert all(row["expected"] == row["actual"] for row in data["rows"])
    inventories.append(data["rows"])
assert inventories[0] == inventories[1]
print("Archived bytes and fixed source inventories verified")
