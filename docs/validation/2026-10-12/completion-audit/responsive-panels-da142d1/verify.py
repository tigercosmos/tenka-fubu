#!/usr/bin/env python3
"""Verify the compact original-source responsive endpoint evidence."""

import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = 'da142d148c7a3833ec9dc970659643ed62df6dc0'


def raw(path: str) -> bytes:
    return gzip.decompress((ROOT / path).read_bytes())


def data(path: str):
    return json.loads(raw(path))


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


checks = []
for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    expected, relative = line.split('  ', 1)
    actual = digest((ROOT / relative).read_bytes())
    assert actual == expected, (relative, expected, actual)
    checks.append(relative)
assert len(checks) == len(set(checks))

before = data('raw/tenka-da-responsive-source-before-c1.json.gz')
pre = data('raw/tenka-da-responsive-source-precontrol-c2.json.gz')
after = data('raw/tenka-da-responsive-source-postcontrol-c6.json.gz')
assert before == pre == after
assert before['revision'] == REVISION
assert before['sourceCount'] == len(before['source']) == 1633
assert before['dependencyCount'] == len(before['dependencies']) == 29
assert before['bad'] == []
manifest = data('source-manifest.json.gz')
assert manifest['revision'] == REVISION
assert len(manifest['entries']) == 1633

for name, panel in [('diplomacy-c3', 'diplomacy'), ('corps-c4', 'corps'), ('taimei-c6', 'taimei')]:
    report = data(f'raw/{name}/report.json.gz')
    result = data(f'raw/{name}/result.json.gz')
    assert report['stats']['expected'] == 3
    assert report['stats']['unexpected'] == 0
    assert result['exitCode'] == 0
    specs = [spec for suite in report['suites'] for spec in suite['specs']]
    assert len(specs) == 3
    assert all(spec['title'].startswith(panel) for spec in specs)
    assert all(test['results'][0]['status'] == 'passed' for spec in specs for test in spec['tests'])
    root = ROOT / f'{panel}-images'
    images = sorted(root.rglob(f'{panel}-*.png'))
    results = sorted(root.rglob(f'{panel}-endpoint-*.json.gz'))
    assert len(results) == 3
    assert len(images) == (9 if panel == 'diplomacy' else 3)
    assert sorted(data(str(path.relative_to(ROOT)))['scale'] for path in results) == [0.8, 1, 1.5]
    for path in results:
        observed = data(str(path.relative_to(ROOT)))
        assert observed['metrics']['viewport'] == [1280, 720]
        assert observed['metrics']['documentWidth'] <= 1281
        assert observed['geometry']
        assert all(row['rect']['width'] >= 32 and row['rect']['height'] >= 32
                   and row['visibleWidth'] >= 32 and row['visibleHeight'] >= 32
                   for row in observed['geometry'])
        if panel == 'diplomacy':
            assert 'NVIDIA' in observed['metrics']['glVendor']
            assert 'Vulkan' in observed['metrics']['glRenderer']

for name in ('diplomacy-red-c1', 'taimei-red-c4', 'taimei-red-c5'):
    report = data(f'raw/{name}/report.json.gz')
    result = data(f'raw/{name}/result.json.gz')
    assert report['stats']['unexpected'] == 3
    assert result['exitCode'] == 1

assert digest(raw('original-diplomacy-test.spec.ts.gz')) == (
    'ddefd52cc94b3928238bed9eda573773d3ea37556b134a0c5ff6b1b21c5726c4'
)
assert digest(raw('original-three-panel-test.spec.ts.gz')) == (
    '6c929cb1775494ce399b8eb2e0fd5c83972348bae08929c911510ff3f2052dc1'
)
print(f'PASS: {len(checks)} SHA-256 files; 1,633 source blobs; 29 dependencies; 9 endpoint PASS; 9 observer RED')
