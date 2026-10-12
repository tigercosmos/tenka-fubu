#!/usr/bin/env python3
"""Verify archived bytes and recorded terminal results; never run tests or timing."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


base = Path(__file__).resolve().parent
manifest = json.loads((base / 'manifest.json').read_text())
assert manifest['status'] == 'final', 'Evidence package remains incomplete'
checked = 0
for entry in manifest['files']:
    packed = (base / entry['path']).read_bytes()
    assert len(packed) == entry['bytes'], entry['path']
    assert sha(packed) == entry['sha256'], entry['path']
    if 'rawSHA256' in entry:
        raw = gzip.decompress(packed)
        assert len(raw) == entry['rawBytes'], entry['path']
        assert sha(raw) == entry['rawSHA256'], entry['path']
    checked += 1

index = json.loads((base / 'raw-log-index.json').read_text())
for entry in index['rows']:
    packed = (base / entry['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == entry['gzipBytes'] and sha(packed) == entry['gzipSHA256']
    assert len(raw) == entry['rawBytes'] and sha(raw) == entry['rawSHA256']

with tarfile.open(fileobj=io.BytesIO((base / manifest['sourceArchive']).read_bytes()), mode='r:gz') as archive:
    sources = {row['path']: row for row in manifest['sources']}
    members = archive.getmembers()
    blobs = {}
    assert {member.name for member in members} == set(sources)
    for member in members:
        assert member.isfile(), member.name
        raw = archive.extractfile(member).read()
        blobs[member.name] = raw
        assert len(raw) == sources[member.name]['bytes'], member.name
        assert sha(raw) == sources[member.name]['sha256'], member.name

artifact = json.loads(blobs['public/wasm/manifest.json'])
assert artifact['wasmSha256'] == manifest['artifact']['sha256']
assert sha(blobs['public/wasm/tenka_engine.wasm']) == artifact['wasmSha256']
assert len(blobs['public/wasm/tenka_engine.wasm']) == manifest['artifact']['bytes']
for path, expected in artifact['sourceFiles'].items():
    assert sha(blobs[path]) == expected, path

before = gzip.decompress((base / manifest['snapshotBefore']).read_bytes())
after = gzip.decompress((base / manifest['snapshotAfter']).read_bytes())
assert before == after
snapshot = json.loads(before)
assert snapshot['head'] == manifest['frozenSource']
assert len(snapshot['files']) == 1494
for row in snapshot['files']:
    if row['path'] in sources:
        assert row['sha256'] == sources[row['path']]['sha256']
        assert row['bytes'] == sources[row['path']]['bytes']

for claim in manifest['loggedClaims']:
    text = gzip.decompress((base / claim['path']).read_bytes()).decode(errors='strict')
    assert re.search(claim['pattern'], text), claim

print(f'PASS: {checked} file hashes, {len(index["rows"])} dual-SHA raw logs, '
      f'{len(sources)} exact source blobs, {len(manifest["loggedClaims"])} logged claims')
print('No test, browser, timing, or historical-source reconstruction executed.')
