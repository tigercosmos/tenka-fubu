#!/usr/bin/env python3
"""Verify the compact final-source representative native-flow evidence."""

import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = '01c7dbc3f45653636e86342fa9e7f8ad5209f89f'
SAVE = 'tenka-01c-representative-saveload-c1'
SMOKE = 'tenka-01c-representative-smoke-c1'
LIST = 'tenka-01c-representative-smoke-list-c1'


def read(path: str) -> bytes:
    return gzip.decompress((ROOT / path).read_bytes())


def data(path: str):
    return json.loads(read(path))


def specs(report):
    def descend(suite):
        for spec in suite['specs']:
            yield spec
        for child in suite.get('suites', []):
            yield from descend(child)

    return [spec for suite in report['suites'] for spec in descend(suite)]


checked = []
for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    expected, relative = line.split('  ', 1)
    actual = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
    assert actual == expected, relative
    checked.append(relative)
assert len(checked) == len(set(checked))

proof = [
    data(f'raw/remote/tenka-01c-representative-source-{suffix}-c1.json.gz')
    for suffix in ('before', 'pretest', 'after')
]
assert proof[0] == proof[1] == proof[2]
assert proof[0]['revision'] == REVISION
assert proof[0]['sourceCount'] == len(proof[0]['source']) == 1641
assert proof[0]['dependencyCount'] == len(proof[0]['dependencies']) == 29
assert proof[0]['bad'] == []
manifest = data('raw/source-manifest.json.gz')
assert manifest['revision'] == REVISION
assert len(manifest['entries']) == 1641

save = data(f'raw/remote/{SAVE}/report.json.gz')
smoke = data(f'raw/remote/{SMOKE}/report.json.gz')
for report, count in ((save, 4), (smoke, 2)):
    assert report['stats']['expected'] == count
    assert report['stats']['unexpected'] == report['stats']['skipped'] == report['stats']['flaky'] == 0
    assert report['stats']['duration'] < 300000
    cases = specs(report)
    assert len(cases) == count
    assert all(len(case['tests']) == 1 and case['tests'][0]['timeout'] == 60000
               and case['tests'][0]['results'][0]['status'] == 'passed' for case in cases)
assert [case['title'][:2] for case in specs(smoke)] == ['P1', 'P2']
for label in (SAVE, SMOKE):
    assert data(f'raw/remote/{label}/result.json.gz')['exitCode'] == 0
assert '--grep=P[12]' in data(f'raw/remote/{SMOKE}/command.json.gz')['argv']

listing = read(f'raw/remote/{LIST}/stdout-stderr.log.gz').decode()
assert 'Total: 2 tests in 1 file' in listing
assert '› P1 ' in listing and '› P2 ' in listing
assert '› P3 ' not in listing and '› P4 ' not in listing and '› P5 ' not in listing
assert data(f'raw/remote/{LIST}/result.json.gz')['exitCode'] == 0
assert 'No such file or directory' in read(
    'raw/captures/tenka-01c-representative-smoke-list-copy-c1/stdout-stderr.log.gz'
).decode()
assert data('raw/captures/tenka-01c-representative-smoke-list-copy-c1/result.json.gz')['exitCode'] == 1
assert data('raw/captures/tenka-01c-representative-smoke-list-copy-c2/result.json.gz')['exitCode'] == 0

for label in ('preflight', 'postproof'):
    output = read(f'raw/captures/tenka-01c-representative-{label}-c1/stdout-stderr.log.gz').decode()
    assert 'b12e3f047736e7accb269d5eeacd649b3f9368f880617d1684ea6917088775dc' in output
    assert '403a72743d3aaa0d2070cb15909a5aaa948fbf94ff65c0017aad24ba0e849cf0' in output

print(f'PASS: {len(checked)} SHA-256 files; 1,641 source blobs; 29 dependencies; save/load 4/4; smoke P1/P2 2/2')
