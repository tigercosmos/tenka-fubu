#!/usr/bin/env python3
"""Verify archived army signal integration checks at the adopted commit."""

import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REVISION = 'ef75be660e0a142da9c6130ac04ffefc9820e7fb'
MANIFEST_SHA = '387bd1341fe7fc1f7a8768519f4610de61ce7eff0dfd42ceb2b599fb05f0ce53'


def sha(data):
    return hashlib.sha256(data).hexdigest()


manifest_bytes = (ROOT / 'manifest.json').read_bytes()
assert sha(manifest_bytes) == MANIFEST_SHA
items = json.loads(manifest_bytes)['items']
assert len(items) == 44
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
    'inventory', 'focused', 'typecheck', 'eslint', 'build', 'bundle', 'format'
]
assert all(row['exitCode'] == 0 for row in status['checks'])
assert obj('outer__result.json')['exitCode'] == 0
assert obj('outer__command.json')['argv'][2:4] == ['--revision', REVISION]
for label in ('inventory', 'focused', 'typecheck', 'eslint', 'build', 'bundle', 'format'):
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

focused = raw('inner__focused.log').decode()
assert 'Test Files  8 passed (8)' in focused
assert 'Tests  207 passed (207)' in focused
assert 'Not implemented: HTMLCanvasElement.prototype.getContext' in focused
assert '✓ built in' in raw('inner__build.log').decode()
assert obj('inner__bundle.result.json')['exitCode'] == 0
assert '"passed": true' in raw('inner__bundle.log').decode()
assert 'All matched files use Prettier code style!' in raw('inner__format.log').decode()
assert raw('inner__focused.command.json').startswith(b'{')
assert len(raw('producer__runner.py')) > 1000
assert len(raw('producer__outer-capture.py')) > 100
assert len(raw('producer__scoped-source-inventory.py')) > 100
print('PASS: 44 archived artifacts, exact source/dependencies, 207 focused tests and six validations')
