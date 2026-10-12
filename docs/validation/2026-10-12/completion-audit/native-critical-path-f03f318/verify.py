#!/usr/bin/env python3
"""Verify compact local evidence; remote trace availability is inventory-only."""
import gzip
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'raw'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def gz_json(name: str):
    return json.loads(gzip.decompress((RAW / name).read_bytes()))


def tar_json(name: str, member: str):
    with tarfile.open(RAW / name) as tar:
        file = tar.extractfile(member)
        assert file is not None
        return json.load(file)


checks = []
for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    expected, name = line.split('  ', 1)
    actual = digest(ROOT / name)
    assert actual == expected, (name, expected, actual)
    checks.append(name)

before = gz_json('source-before.json.gz')
after = gz_json('source-after.json.gz')
assert before == after
assert before['revision'] == 'f03f3188f5cd86590864a10e65a99123a365a689'
assert before['sourceCount'] == len(before['source']) == 1633
assert before['dependencyCount'] == len(before['dependencies']) == 29
assert before['bad'] == []

inventory = gz_json('remote-inventory.json.gz')
assert inventory['activeProcesses'] == []
indexed = {row['path']: row for row in inventory['files']}
traces = [row for row in inventory['files'] if row['path'].endswith('/trace.zip')]
assert sorted(row['size'] for row in traces) == [70791057, 71231222]
assert all(len(row['sha256']) == 64 for row in traces)

for label, filename in [('original', 'production-events.spec.ts'),
                        ('observed', 'production-events-original-observed.spec.ts')]:
    report = tar_json(f'{label}-capture.tar.gz', 'report.json')
    result = tar_json(f'{label}-capture.tar.gz', 'result.json')
    command = tar_json(f'{label}-capture.tar.gz', 'command.json')
    assert result['exitCode'] == 1
    assert report['stats']['unexpected'] == 1
    assert report['stats']['expected'] == 0
    assert f'e2e/{filename}' in command['argv']
    with tarfile.open(RAW / f'{label}-capture.tar.gz') as tar:
        log = tar.extractfile('stdout-stderr.log')
        assert log is not None
        body = log.read().decode()
    assert 'speed-5' in body and 'Timeout 500ms exceeded' in body
    assert 'visible, enabled and stable' in body
    for suffix in ('frames.json.gz', 'frame.jpeg'):
        assert (RAW / f'{label}-{suffix}').exists()
    meta = gz_json(f'{label}-frames.json.gz')
    assert len(meta['frames']) == 8
    assert len({frame['sha256'] for frame in meta['frames']}) == 1
    assert digest(RAW / f'{label}-frame.jpeg') == meta['frames'][2]['sha256']
    assert meta['trace'] in indexed

assert digest(RAW / 'observed-test.spec.ts.gz') != ''
assert hashlib.sha256(gzip.decompress((RAW / 'observed-test.spec.ts.gz').read_bytes())).hexdigest() == (
    '240b6c91b91c77a46ce5d967312f42bbfdf7675e81829e7a0f762d4254d92648'
)
assert digest(RAW / 'first-frame-extraction.tar.gz') == (
    '82074969e5514eba31f2a676b9c137b32f75034a56df951aea5c8c239b864ae7'
)
with tarfile.open(RAW / 'unrun-proposals.tar.gz') as tar:
    names = set(tar.getnames())
    assert names == {'tenka-f03-event-instrumented-original-v2.spec.ts',
                     'tenka-f03-event-virtual-candidate-v2.spec.ts'}
print(f'PASS: {len(checks)} SHA-256 files; 1633 source blobs; 29 dependency targets; two RED controls; 16 stable frames; two remote trace hashes; no active browser process')
