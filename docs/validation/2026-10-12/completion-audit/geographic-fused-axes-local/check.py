"""Verify candidate evidence without rerunning tests or native timing."""
import gzip
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
def raw(path):
    return gzip.decompress((root / path).read_bytes())
for entry in manifest['entries']:
    compressed = (root / entry['path']).read_bytes()
    data = gzip.decompress(compressed)
    assert len(compressed) == entry['gzipBytes'], entry['path']
    assert len(data) == entry['rawBytes'], entry['path']
    assert hashlib.sha256(compressed).hexdigest() == entry['gzipSha256'], entry['path']
    assert hashlib.sha256(data).hexdigest() == entry['rawSha256'], entry['path']
assert hashlib.sha256(raw('raw/geographicLabelLayout-before.ts.gz')).hexdigest() == manifest['originalSourceSha256']
assert hashlib.sha256(raw('source/tests/helpers/geographicWasmReference.ts.gz')).hexdigest() == manifest['frozenReferenceSha256']
wasm = raw('source/public/wasm/tenka_engine.wasm.gz')
assert len(wasm) == manifest['artifact']['bytes']
assert hashlib.sha256(wasm).hexdigest() == manifest['artifact']['sha256']
build = json.loads(raw('source/public/wasm/manifest.json.gz'))
assert build['wasmSha256'] == manifest['artifact']['sha256']
assert build['sourceSha256'] == manifest['artifact']['sourceSha256']
for path, digest in build['sourceFiles'].items():
    assert hashlib.sha256(raw('source/' + path + '.gz')).hexdigest() == digest, path
assert 'Test Files  1 failed | 2 passed (3)' in raw('raw/focused-first.log.gz').decode()
assert 'Tests  26 passed (26)' in raw('raw/focused-final.log.gz').decode()
before = raw('raw/tenka-fixed-5224-before.json.gz')
assert before == raw('raw/tenka-fixed-5224-after.json.gz')
assert before == raw('raw/tenka-fixed-5224-after-checks.json.gz')
assert manifest['fixedIntegration']['checks']['afterChecksByteIdentical']
assert len(json.loads(before)['files']) == manifest['fixedIntegration']['trackedInputs'] == 1486
checksums = root / 'SHA256SUMS'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
print(f"PASS: {len(manifest['entries'])} raw/gzip SHA pairs; frozen reference and artifact identity")
