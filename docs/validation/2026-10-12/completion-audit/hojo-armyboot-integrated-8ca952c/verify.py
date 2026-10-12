#!/usr/bin/env python3
"""Verify frozen Hojo and army boot E2E integration checks."""

import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REVISION = '8ca952c30a8ae007ca988fd9c3294b59d3402b14'
MANIFEST_SHA = '2581a73632ca4b4c0fcacf1490a1515a1e03afe34602fb279d794c06526415e4'


def sha(data):
    return hashlib.sha256(data).hexdigest()


manifest_bytes = (ROOT / 'manifest.json').read_bytes()
assert sha(manifest_bytes) == MANIFEST_SHA
items = json.loads(manifest_bytes)['items']
assert len(items) == 38
listed = {item['file'] for item in items}
assert len(listed) == len(items)
assert listed == {str(path.relative_to(ROOT)) for path in (ROOT / 'raw').iterdir() if path.is_file()}
for item in items:
    packed = (ROOT / item['file']).read_bytes()
    data = gzip.decompress(packed)
    assert len(packed) == item['gzipBytes'] and sha(packed) == item['gzipSha256']
    assert len(data) == item['rawBytes'] and sha(data) == item['rawSha256']


def raw(name):
    path = 'raw/' + name + '.gz'
    assert path in listed, name
    return gzip.decompress((ROOT / path).read_bytes())


def obj(name):
    return json.loads(raw(name))


status = obj('inner__status.json')
assert status['revision'] == REVISION
assert status['beforePassed'] and status['afterPassed'] and status['passed']
assert [row['label'] for row in status['checks']] == [
    'inventory', 'typecheck', 'eslint', 'discovery', 'format'
]
assert all(row['exitCode'] == 0 for row in status['checks'])
assert obj('outer__result.json')['exitCode'] == 0
assert obj('outer__command.json')['argv'][2:4] == ['--revision', REVISION]
for label in ('inventory', 'typecheck', 'eslint', 'discovery', 'format'):
    assert obj('inner__' + label + '.result.json')['exitCode'] == 0

inventory = obj('inner__source-inventory__manifest.json')
assert inventory['revision'] == REVISION
assert len(inventory['entries']) == 1650
assert len(inventory['archivePaths']) == 1650
assert obj('inner__source-inventory__revision-commit.result.json')['exitCode'] == 0
assert obj('inner__source-inventory__revision-tree.result.json')['exitCode'] == 0
assert raw('inner__source-inventory__revision-commit.stdout').decode().strip() == REVISION

before = obj('inner__before-source.json')
after = obj('inner__after-source.json')
assert before == after
assert before['revision'] == REVISION and before['count'] == 1650 and before['passed']
assert {row['path'] for row in before['rows']} == set(inventory['entries'])
for row in before['rows']:
    assert row['expectedBlob'] == row['actualBlob'] == inventory['entries'][row['path']]['gitBlob']
    assert row['modeMatches'] and len(row['sha256']) == 64
deps_before = obj('inner__before-pixi.json')
deps_after = obj('inner__after-pixi.json')
assert deps_before == deps_after
assert deps_before['count'] == 29 and deps_before['passed']
assert all(row['expectedSha256'] == row['actualSha256'] for row in deps_before['rows'])
assert obj('inner__before-result.json')['passed']
assert obj('inner__after-result.json')['passed']

assert 'Total: 441 tests in 106 files' in raw('inner__discovery.log').decode()
assert obj('inner__discovery.command.json')['argv'] == [
    'node_modules/.bin/playwright', 'test', '--list', '--project=chromium'
]
assert '0 errors, 2 warnings' in raw('inner__eslint.log').decode()
assert 'All matched files use Prettier code style!' in raw('inner__format.log').decode()
for producer in ('runner.py', 'outer-capture.py', 'scoped-source-inventory.py'):
    assert len(raw('producer__' + producer)) > 100
print('PASS: 38 archived artifacts, 1650 source inputs, 29 dependency targets, types/lint/441 discovery/format')
