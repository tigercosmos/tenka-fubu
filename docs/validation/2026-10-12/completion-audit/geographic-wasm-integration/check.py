"""Verify integration evidence without executing tests."""
import gzip
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
for entry in manifest['entries']:
    packed = (root / entry['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == entry['gzipBytes'], entry['path']
    assert len(raw) == entry['rawBytes'], entry['path']
    assert hashlib.sha256(packed).hexdigest() == entry['gzipSha256'], entry['path']
    assert hashlib.sha256(raw).hexdigest() == entry['rawSha256'], entry['path']
def read_json(name):
    return json.loads(gzip.decompress((root / ('raw/' + name + '.gz')).read_bytes()))
assert read_json('tenka-fixed-fb9-before.json') == read_json('tenka-fixed-fb9-after.json')
assert manifest['baselineManifestsIdentical']
assert read_json('tenka-fixed-9e49-before.json') == read_json('tenka-fixed-9e49-after.json')
assert manifest['repairManifestsByteIdentical']
assert read_json('tenka-fixed-9e49-before.json') == read_json('tenka-fixed-9e49-after-checks.json')
assert manifest['repairFullChecks']['afterChecksManifestsByteIdentical']
print(f"PASS: {len(manifest['entries'])} gzip/raw SHA pairs; baseline and repair manifests identical")

checksums = root / 'SHA256SUMS'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
