#!/usr/bin/env python3
"""Verify compact army-plate boot evidence without launching a browser."""

import gzip
import hashlib
import json
import tarfile
from pathlib import Path


root = Path(__file__).resolve().parent


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


local = json.loads((root / 'local-raw-manifest.json').read_text())
local_entries = {entry['source']: entry for entry in local['items']}
assert len(local_entries) == len(local['items']) == 234


def local_raw(source: str) -> bytes:
    entry = local_entries[f'/tmp/{source}']
    compressed = (root / entry['file']).read_bytes()
    assert len(compressed) == entry['gzipBytes']
    assert sha(compressed) == entry['gzipSha256']
    data = gzip.decompress(compressed)
    assert len(data) == entry['rawBytes']
    assert sha(data) == entry['rawSha256']
    return data


for source in local_entries:
    local_raw(source.removeprefix('/tmp/'))

remote = json.loads((root / 'manifest.json').read_text())
remote_entries = {entry['path']: entry for entry in remote['items']}
assert len(remote_entries) == len(remote['items']) == 22
with tarfile.open(root / 'selected-raw.tar.gz', 'r:gz') as archive:
    members = [m for m in archive.getmembers() if m.isfile()]
    assert {m.name for m in members} == set(remote_entries)
    for member in members:
        data = archive.extractfile(member).read()
        entry = remote_entries[member.name]
        assert len(data) == entry['bytes'] and sha(data) == entry['sha256']


def remote_raw(path: str) -> bytes:
    with tarfile.open(root / 'selected-raw.tar.gz', 'r:gz') as archive:
        return archive.extractfile(path).read()


for name, expected in [
    ('original', 0),
    ('observed', 0),
    ('oldcatch-red', 1),
    ('candidate-all6', 0),
]:
    stem = f'tenka-armyplate-{name}-4dd-c1'
    result = json.loads(remote_raw(f'{stem}/result.json'))
    assert result['exitCode'] == expected
assert b'6 passed (10.3s)' in remote_raw('tenka-armyplate-candidate-all6-4dd-c1/stdout-stderr.log')
assert b'Received promise resolved instead of rejected' in remote_raw(
    'tenka-armyplate-oldcatch-red-4dd-c1/stdout-stderr.log'
)
attempt = json.loads(next(
    remote_raw(item['path']) for item in remote['items']
    if item['path'].endswith('/boot-attempts.json')
))
assert len(attempt) == 1 and attempt[0]['success'] is True
assert attempt[0]['readiness'] is True and attempt[0]['canvasCount'] == 1
assert 'NVIDIA GeForce RTX 5070 Ti' in attempt[0]['gpu']

source_manifest = json.loads(local_raw('tenka-armyplate-source-out-4dd-c1/manifest.json'))
assert source_manifest['revision'] == '4dd1a55443e6b5c134a065b192a5623a7160a8de'
assert len(source_manifest['entries']) == 1650
assert local_entries['/tmp/tenka-armyplate-candidate-4dd-c1.spec.ts']['rawSha256'] == (
    '35b9a0fc50e9f041763ec8588019cad33b528d82462eeefb3827f454bd999d71'
)
assert local_entries['/tmp/tenka-armyplate-oldcatch-4dd-c1.spec.ts']['rawSha256'] == (
    'dda9109dd4c91fba884c90fdd2671e318e23ac3d03a6108ff9e231b3f49f5660'
)
for name in ['before', 'build', 'observer', 'oldcatch', 'candidate', 'afterall']:
    path = {
        'before': 'tenka-armyplate-sourceproof-before-4dd-c1',
        'build': 'tenka-armyplate-sourceproof-build-4dd-c1',
        'observer': 'tenka-armyplate-sourceproof-observer-4dd-c2',
        'oldcatch': 'tenka-armyplate-sourceproof-oldcatch-4dd-c1',
        'candidate': 'tenka-armyplate-sourceproof-candidate-4dd-c1',
        'afterall': 'tenka-armyplate-sourceproof-afterall-4dd-c1',
    }[name]
    proof = json.loads(local_raw(f'{path}/stdout-stderr.log'))
    assert proof['revision'] == source_manifest['revision']
    assert proof['sourceCount'] == 1650 and proof['dependencyCount'] == 29
    assert proof['bad'] == []
    if name in ['candidate', 'afterall']:
        assert proof['overlay']['e2e/army-plate-layout.spec.ts'] == (
            '35b9a0fc50e9f041763ec8588019cad33b528d82462eeefb3827f454bd999d71'
        )

for n in [1, 2, 3]:
    events = [json.loads(line) for line in local_raw(
        f'tenka-armyplate-trace-test-955-c{n}/stdout-stderr.log'
    ).splitlines()]
    evaluations = [event for event in events
                   if event.get('type') == 'before'
                   and event.get('method') == 'pw:api'
                   and 'waitMapIdle' in str(event.get('params', {}))]
    assert len(evaluations) == 1
    poll_timeouts = [event for event in events
                     if event.get('type') == 'after'
                     and 'Timeout 5000ms exceeded while waiting on the predicate'
                     in event.get('error', {}).get('message', '')]
    assert len(poll_timeouts) == 1

assert len(remote['remoteTraces']) == 1
assert remote['remoteTraces'][0]['sha256'] == (
    '422cb0068d610c212e9efd5c74ffbe42c56ecd28243087445b7424f3e8481e81'
)
print('PASS: 234 local and 22 remote raw hashes; 1650 source/29 deps; old-control RED, final 6 PASS; three retained pending-Evaluate traces')
