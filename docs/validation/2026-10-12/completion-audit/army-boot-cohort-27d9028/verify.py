#!/usr/bin/env python3
"""Verify retained cohort bytes and bounded claims without launching a browser."""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'raw-manifest.json').read_text())
assert len(manifest['files']) == 26
for row in manifest['files']:
    packed = (root / row['packagePath']).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == row['packageSha256'], row['name']
    original = gzip.decompress(packed) if row['packagePath'].endswith('.gz') else packed
    assert len(original) == row['rawBytes'], row['name']
    assert hashlib.sha256(original).hexdigest() == row['rawSha256'], row['name']

def raw(name):
    return gzip.decompress((root / 'raw' / (name + '.gz')).read_bytes())

def data(name):
    return json.loads(raw(name))

report = data('report.json')
analysis = json.loads((root / 'analysis.json').read_text())
assert len(analysis['allCases']) == 18
assert Counter(row['status'] for row in analysis['allCases']) == {'passed': 16, 'failed': 2}
assert report['stats']['expected'] == 16
assert report['stats']['unexpected'] == 2
assert report['stats']['skipped'] == 0
assert len(raw('cohort18-test-list-v3.txt').decode().splitlines()) == 18
assert 'one-shot' not in raw('cohort18-test-list-v3.txt').decode()
assert b'Running 18 tests using 16 workers' in raw('stdout-stderr.log')

overlays = data('review-manifest-v3.json')
assert len(overlays) == 4
assert {row['path'] for row in overlays} == {
    'src/ui/map/armyBootProbe.ts',
    'src/ui/map/MapCanvasHost.tsx',
    'src/ui/map/MapRenderer.ts',
    'e2e/army-plate-layout.spec.ts',
}
for name in ('proof-before.json', 'proof-postbuild.json', 'proof-after.json'):
    proof = data(name)
    assert proof['revision'] == '27d9028f01e38e67cfb0adf65b933ffd44485930'
    assert proof['sourceCount'] == 1650
    assert proof['dependencyCount'] == 29
    assert proof['bad'] == []
    assert proof['overlay'] == {row['path']: row['overlaySha256'] for row in overlays}

assert b'Total: 18 tests in 10 files' in raw('discovery-sim2-18.log')
assert b'Total: 0 tests in 0 files' in raw('discovery-local-empty.log')
assert b'Malformed test description' in raw('discovery-local-malformed.log')

inventory = data('browser-inventory.json')
assert inventory['fileCount'] == 60
assert sum(row['bytes'] for row in inventory['files']) == inventory['totalBytes']
for label, marker in [('body', '5ea75'), ('dense', '0bca0')]:
    failure = analysis['failures'][label]
    assert len(failure['activeCasesAtBrowserEntry']) == 16
    assert len(failure['pngNetwork']) == 29
    assert {entry['status'] for entry in failure['pngNetwork']} == {200}
    stages = [entry['stage'] for entry in failure['browserEvents']]
    assert 'renderer-registered' in stages
    assert 'evaluate-enter' in stages
    assert 'wait-queued' in stages
    assert 'ticker-heartbeat' in stages
    assert 'army-pending-finally' in stages
    if label == 'body':
        assert 'wait-resolved' not in stages
    else:
        assert 'terrain-pending-finally' in stages
        assert 'castle-pending-finally' in stages
        assert 'wait-resolved' in stages
        assert 'evaluate-idle-resolved' in stages
    matching = [entry for entry in inventory['files'] if marker in entry['path'] and entry['path'].endswith('/trace.zip')]
    assert len(matching) == 1, (label, matching)
    assert hashlib.sha256((root / 'raw' / (label + '-trace.zip')).read_bytes()).hexdigest() == matching[0]['sha256']

checksums = (root / 'SHA256SUMS').read_text().splitlines()
for line in checksums:
    expected, name = line.split('  ', 1)
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
print('PASS: 26 raw files, 18 cases (16 pass/2 boot RED), 1,650 source inputs, 4 overlays, 29 dependencies, two matched failure traces')
