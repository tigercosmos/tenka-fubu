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

origin = json.loads(gzip.decompress((root / 'source-origin.json.gz').read_bytes()))
assert summary['source'] == origin
assert origin['base'] == '2d872d74dda8f7dac4697bfdffd3a471418e4135'
assert len(origin['overlays']) == 3
source = {row['path']: row['actual'] for row in inventories[0]}
for row in origin['overlays']:
    assert source[row['path']] == row['candidateSha256']
assert sum(row['sourcePath'].endswith('.heapsnapshot') for row in summary['artifacts']) == 5
for kind, count in [('original', 21), ('diagnostic', 241)]:
    row = next(row for row in summary['artifacts'] if row['sourcePath'].startswith(kind + '-results/') and row['sourcePath'].endswith('/remount-heap-samples.json'))
    samples = json.loads(gzip.decompress((root / row['path']).read_bytes()))['usedHeapBytes']
    assert len(samples) == count == summary[kind]['sampleCount']
    assert samples[-1] - samples[0] == summary[kind]['delta']
    assert samples[-1] - samples[-20] == summary[kind]['last20Delta']
    if kind == 'diagnostic':
        assert samples[-1] - samples[120] == summary[kind]['second120Delta']
print('Exact overlays, five full snapshots, and all reported sample deltas verified')
