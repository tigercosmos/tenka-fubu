"""Verify restored-source evidence without test execution."""
import gzip
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
def raw(name):
    return gzip.decompress((root / name).read_bytes())
for entry in manifest['entries']:
    packed = (root / entry['path']).read_bytes()
    data = gzip.decompress(packed)
    assert len(packed) == entry['gzipBytes'], entry['path']
    assert len(data) == entry['rawBytes'], entry['path']
    assert hashlib.sha256(packed).hexdigest() == entry['gzipSha256'], entry['path']
    assert hashlib.sha256(data).hexdigest() == entry['rawSha256'], entry['path']
restored = raw('restored/src/ui/map/geographicLabelLayout.ts.gz')
assert restored == raw('original04/src/ui/map/geographicLabelLayout.ts.gz')
assert hashlib.sha256(restored).hexdigest() == manifest['restoredGeoSourceSha256']
assert 'Tests  26 passed (26)' in raw('raw/tenka-geographic-withdrawal-focused.log.gz').decode()
before = raw('raw/tenka-fixed-3d6a-before.json.gz')
assert before == raw('raw/tenka-fixed-3d6a-after.json.gz')
assert before == raw('raw/tenka-fixed-3d6a-after-checks.json.gz')
assert manifest['fixedIntegration']['checks']['afterChecksByteIdentical']
assert len(json.loads(before)['files']) == manifest['fixedIntegration']['trackedInputs'] == 1486
proof = json.loads(raw('raw/tenka-fixed-3d6a-compiled-assets.json.gz'))
assert proof['allEqual']
assert len(proof['assets']) == manifest['compiledAssetsComparison']['assets'] == 8
for asset in proof['assets']:
    assert asset['equal']
    assert asset['oldBytes'] == asset['newBytes']
    assert asset['oldSha256'] == asset['newSha256']
assert proof['wasm']['equal']
assert proof['wasm']['oldBytes'] == proof['wasm']['newBytes'] == 63073
assert proof['wasm']['oldSha256'] == proof['wasm']['newSha256'] == manifest['compiledAssetsComparison']['wasmSha256']
old_inputs = json.loads(raw('raw/tenka-fixed-04c7-restored-comparison-inputs.json.gz'))
assert old_inputs['head'] == manifest['originalGeoSourceCommit']
assert len(old_inputs['files']) == 1485
checksums = root / 'SHA256SUMS'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
print(f"PASS: {len(manifest['entries'])} raw/gzip SHA pairs; restored source equals original04")
