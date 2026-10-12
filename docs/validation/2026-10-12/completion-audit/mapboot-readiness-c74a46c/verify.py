#!/usr/bin/env python3
"""Verify source and retained native outcomes for map startup readiness."""
import json
import hashlib
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
base = json.loads((HERE / 'base-manifest.json').read_text())
candidate = json.loads((HERE / 'candidate-manifest.json').read_text())
assert base['revision'] == 'ecba08b76b772a598a6e6ceb61615b648c765170'
assert len(base['entries']) == 1632 and len(candidate['entries']) == 1633
changed = {name for name in candidate['entries'] if candidate['entries'][name] != base['entries'].get(name)}
assert changed == {
    'e2e/map-ready.ts', 'e2e/coast-surface-layout.spec.ts',
    'e2e/army-plate-material.spec.ts', 'e2e/context-panel-focus.spec.ts',
}
capture = Path(tempfile.mkdtemp(prefix='tenka-mapboot-c74-verify-git-'))
command = ['git', 'ls-tree', '-rz', 'c74a46c']
with (capture / 'command.json').open('x') as target:
    json.dump({'argv': command, 'cwd': str(REPO)}, target)
with (capture / 'stdout').open('xb') as stdout, (capture / 'stderr').open('xb') as stderr:
    result = subprocess.run(command, cwd=REPO, stdout=stdout, stderr=stderr)
with (capture / 'result.json').open('x') as target:
    json.dump({'exitCode': result.returncode}, target)
result.check_returncode()
raw = (capture / 'stdout').read_bytes()
tracked = {}
for row in raw.split(b'\0'):
    if row:
        meta, name = row.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        tracked[name.decode()] = {'mode': mode, 'gitBlob': oid}
for name, expected in candidate['entries'].items():
    assert tracked[name] == expected, name

fingerprints = [json.loads((HERE / f'{name}-fingerprint.json').read_text()) for name in
                ('sourcebefore', 'candidatebefore', 'candidateafter')]
assert [item['checked'] for item in fingerprints] == [1632, 1633, 1633]
assert all(not item['mismatches'] for item in fingerprints)
assert fingerprints[0]['pixiFiles'] == fingerprints[1]['pixiFiles'] == fingerprints[2]['pixiFiles']
assert len(fingerprints[0]['pixiFiles']) == 3695
assert (HERE / 'transfer-collision-last-copy.json').read_bytes() == (HERE / 'candidateafter-fingerprint.json').read_bytes()

def outcome(archive, run):
    with tarfile.open(HERE / archive, 'r:gz') as raw:
        def read(file):
            member = raw.extractfile(f'{run}/{file}')
            assert member is not None
            return member.read()
        return json.loads(read('result.json'))['exitCode'], read('stdout-stderr.log').decode()

old = outcome('native-raw.tar.gz', 'tenka-mapboot-old-delay-two-red-v1')
delayed = outcome('native-raw.tar.gz', 'tenka-mapboot-candidate-delay-four-v1')
final = outcome('native-raw.tar.gz', 'tenka-mapboot-final-four-v1')
assert old[0] == 1 and '2 failed' in old[1]
assert old[1].count('map renderer 尚未掛載') >= 2
assert delayed[0] == 0 and '4 passed' in delayed[1]
assert final[0] == 0 and '4 passed' in final[1]
assert outcome('setup-raw.tar.gz', 'tenka-mapboot-build-ecba-v1')[0] == 0
listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    listed[name] = digest
assert set(listed) == {path.name for path in HERE.iterdir() if path.is_file() and path.name != 'SHA256SUMS'}
for name, digest in listed.items():
    assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == digest, name
print('mapboot readiness evidence PASS: old 2 RED; delayed 4 PASS; exact 4 PASS; 1633 source; 3695 Pixi files')
