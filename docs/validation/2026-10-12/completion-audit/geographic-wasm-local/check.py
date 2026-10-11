"""Verify retained evidence bytes without executing project tests."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
for entry in manifest['entries']:
    compressed = (root / entry['path']).read_bytes()
    raw = gzip.decompress(compressed)
    assert len(compressed) == entry['gzipBytes'], entry['path']
    assert len(raw) == entry['rawBytes'], entry['path']
    assert hashlib.sha256(compressed).hexdigest() == entry['gzipSha256'], entry['path']
    assert hashlib.sha256(raw).hexdigest() == entry['rawSha256'], entry['path']
artifact = gzip.decompress((root / 'source/public/wasm/tenka_engine.wasm.gz').read_bytes())
assert len(artifact) == manifest['wasmBytes']
assert hashlib.sha256(artifact).hexdigest() == manifest['wasmSha256']
build = json.loads(gzip.decompress((root / 'source/public/wasm/manifest.json.gz').read_bytes()))
assert build['wasmSha256'] == manifest['wasmSha256']
assert build['sourceSha256'] == manifest['artifactSourceSha256']
for path, digest in build['sourceFiles'].items():
    raw = gzip.decompress((root / ('source/' + path + '.gz')).read_bytes())
    assert hashlib.sha256(raw).hexdigest() == digest, path
lock = gzip.decompress((root / 'source/rust/engine/Cargo.lock.gz').read_bytes()).decode()
assert lock.count('[[package]]') == 1
assert all(member['matchesFb9'] for member in manifest['originalTarMembers'])
checksums = root / 'SHA256SUMS'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
print(f"PASS: {len(manifest['entries'])} gzip/raw SHA pairs; artifact/source identity; zero Rust dependencies")
