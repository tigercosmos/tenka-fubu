#!/usr/bin/env python3
"""Validate producer evidence without executing a build or benchmark."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


base = Path(__file__).resolve().parent
m = json.loads((base / 'manifest.json').read_text())
archive = (base / m['archive']['path']).read_bytes()
assert len(archive) == m['archive']['bytes'] and sha(archive) == m['archive']['sha256']
raw = gzip.decompress(archive)
assert len(raw) == m['archive']['rawBytes'] and sha(raw) == m['archive']['rawSHA256']
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as t:
    members = {p.name: t.extractfile(p).read() for p in t.getmembers() if p.isfile()}
assert set(members) == {r['path'] for r in m['members']}
for row in m['members']:
    data = members[row['path']]
    assert len(data) == row['bytes'] and sha(data) == row['sha256']
assert m['buildExit'] == int(members['evidence/build-exit.txt']) == 0
assert members['evidence/comparison.txt'] == b'binary_cmp=0\nmanifest_cmp=0\n'
assert len(members['evidence/frozen-mac.wasm']) == m['artifact']['bytes']
assert sha(members['evidence/frozen-mac.wasm']) == m['artifact']['sha256']
assert sha(members['evidence/frozen-mac-manifest.json']) == m['artifact']['manifestSHA256']
abi = json.loads(members['evidence/abi.json'])
assert abi['bytes'] == 88475 and len(abi['versions']) == 4
assert set(abi['versions'].values()) == {1}
assert members['evidence/before-source.json'] == members['evidence/after-source.json']
rows = json.loads(members['evidence/before-source.json'])
assert len(rows) == m['sourceProof']['checkedFiles'] == 733
if '--git' in sys.argv:
    request = ''.join(f'{m["frozenSource"]}:{r["path"]}\n' for r in rows).encode()
    output = subprocess.check_output(['git', 'cat-file', '--batch'], input=request)
    cursor = 0
    for row in rows:
        end = output.index(b'\n', cursor)
        header = output[cursor:end].split()
        assert header[1] == b'blob'
        size = int(header[2])
        data = output[end + 1:end + 1 + size]
        assert size == row['bytes'] and sha(data) == row['sha256'], row['path']
        cursor = end + 2 + size
    assert cursor == len(output)
print(f'PASS: {len(members)} raw members, artifact/manifest byte parity, 4 actual ABI versions, '
      f'{len(rows)} unchanged source rows; git proof={"--git" in sys.argv}')
