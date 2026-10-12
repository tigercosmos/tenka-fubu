"""Check the complete native memory package without a browser rerun."""

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
for name in ("source-before", "source-after-original", "source-final"):
    data = json.loads(gzip.decompress((root / (name + ".json.gz")).read_bytes()))
    assert data["passed"]
    assert data["sourceCount"] == 1555
    assert all(row["equal"] and row["actual"] == row["expected"] for row in data["rows"])
    inventories.append(data["rows"])
assert inventories[0] == inventories[1] == inventories[2]
assert summary["originalExit"] == summary["diagnosticExit"] == 0
print("All native artifacts and three fixed-source checkpoints verified")
