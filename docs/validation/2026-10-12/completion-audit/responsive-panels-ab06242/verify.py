#!/usr/bin/env python3
"""Verify the immutable combined responsive-panel evidence package."""

import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = 'ab06242a542d7dda95ef3f17ec54e81ee1354076'
RUN = '/tmp/tenka-ab-responsive-diplomacy15-c1/browser-results/'
SCALES = [round(0.8 + index * 0.05, 2) for index in range(15)]


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def load(path: str):
    return json.loads(gzip.decompress((ROOT / path).read_bytes()))


checks = []
for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    expected, relative = line.split('  ', 1)
    assert digest((ROOT / relative).read_bytes()) == expected, relative
    checks.append(relative)
assert len(checks) == len(set(checks))

before = load('raw/tenka-ab-responsive-source-before-c1.json.gz')
pretest = load('raw/tenka-ab-responsive-source-pretest-c1.json.gz')
after = load('raw/tenka-ab-responsive-source-after-c1.json.gz')
assert before == pretest == after
assert before['revision'] == REVISION
assert before['sourceCount'] == len(before['source']) == 1640
assert before['dependencyCount'] == len(before['dependencies']) == 29
assert before['bad'] == []
manifest = load('raw/source-manifest.json.gz')
assert manifest['revision'] == REVISION
assert len(manifest['entries']) == 1640

overlay = gzip.decompress((ROOT / 'raw/tested-overlay.spec.ts.gz').read_bytes())
assert digest(overlay) == 'f43082a5477824a039363cb1fcdae8b8140bc66fd8fa17e8782f6ddb76b0072b'
command = load('raw/command.json.gz')
result = load('raw/result.json.gz')
report = load('raw/report.json.gz')
assert '--grep=diplomacy' in command['argv']
assert result['exitCode'] == 0
assert report['stats']['expected'] == 45
assert report['stats']['unexpected'] == report['stats']['skipped'] == report['stats']['flaky'] == 0
assert report['stats']['duration'] < 300000
specs = [spec for suite in report['suites'] for spec in suite['specs']]
assert len(specs) == 45
for spec in specs:
    assert len(spec['tests']) == 1
    test = spec['tests'][0]
    assert test['timeout'] == 60000
    assert len(test['results']) == 1
    assert test['results'][0]['status'] == 'passed'

inventory = load('raw/remote-inventory.json.gz')
assert len(inventory) == 136
assert len({row['path'] for row in inventory}) == 136
assert all(row['path'].startswith(RUN) and len(row['sha256']) == 64 for row in inventory)
assert sum(row['path'].endswith('.png') for row in inventory) == 75
assert sum('-endpoint-' in row['path'] for row in inventory) == 45
assert sum('entry-focus-' in row['path'] for row in inventory) == 15
by_basename = {Path(row['path']).name: row for row in inventory}
assert len(by_basename) == 136

for panel in ('diplomacy', 'corps', 'taimei'):
    records = sorted((ROOT / 'geometry').glob(f'{panel}-endpoint-*.json.gz'))
    assert len(records) == 15
    scales = []
    for record in records:
        payload = gzip.decompress(record.read_bytes())
        remote = by_basename[record.name.removesuffix('.gz')]
        assert digest(payload) == remote['sha256']
        observed = json.loads(payload)
        scales.append(observed['scale'])
        assert observed['metrics']['viewport'] == [1280, 720]
        assert observed['metrics']['documentWidth'] == 1280
        assert observed['geometry']
        assert all(row['rect']['width'] >= 32 and row['rect']['height'] >= 32
                   and row['visibleWidth'] >= 32 and row['visibleHeight'] >= 32
                   for row in observed['geometry'])
        for text in observed['text']:
            assert text['rects']
            assert all(rect['left'] >= text['host']['left'] - 1
                       and rect['right'] <= text['host']['right'] + 1
                       for rect in text['rects'])
        if panel == 'diplomacy':
            assert 'NVIDIA' in observed['metrics']['glVendor']
            assert 'Vulkan' in observed['metrics']['glRenderer']
        else:
            assert observed['focus']
    assert sorted(scales) == SCALES

focus = list((ROOT / 'geometry').glob('diplomacy-entry-focus-*.json.gz'))
assert len(focus) == 15
for record in focus:
    payload = gzip.decompress(record.read_bytes())
    assert digest(payload) == by_basename[record.name.removesuffix('.gz')]['sha256']
    assert json.loads(payload)

images = list((ROOT / 'images').glob('*.png'))
assert len(images) == 10
for image in images:
    assert digest(image.read_bytes()) == by_basename[image.name]['sha256']

print(f'PASS: {len(checks)} SHA-256 files; 1,640 source blobs; 29 dependencies; 45/45 cases; 15 scales × 3 panels; 136 remote hashes')
