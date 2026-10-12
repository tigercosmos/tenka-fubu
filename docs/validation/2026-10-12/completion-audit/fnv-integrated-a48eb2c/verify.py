#!/usr/bin/env python3
"""Verify frozen FNV arithmetic integration checks."""

import gzip
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REVISION = 'a48eb2c2a139108f3ff9fcc4e2c3e11a0bf6a875'
MANIFEST_SHA = 'cdef1463ce864a5c7e4f2166873487d22aec11e935c3bcaaf10ce063d60801e7'


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
assert len(inventory['entries']) == 1652
assert len(inventory['archivePaths']) == 1652
assert obj('inner__source-inventory__revision-commit.result.json')['exitCode'] == 0
assert obj('inner__source-inventory__revision-tree.result.json')['exitCode'] == 0
assert raw('inner__source-inventory__revision-commit.stdout').decode().strip() == REVISION

before = obj('inner__before-source.json')
after = obj('inner__after-source.json')
assert before == after
assert before['revision'] == REVISION and before['count'] == 1652 and before['passed']
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

assert '13 passed (13)' in raw('inner__focused.log').decode()
assert '135 passed (135)' in raw('inner__focused.log').decode()
assert obj('inner__focused.command.json')['argv'][:2] == ['node_modules/.bin/vitest', 'run']
assert len(obj('inner__focused.command.json')['argv'][2:]) == 13
assert '0 errors, 2 warnings' in raw('inner__eslint.log').decode()
assert 'All matched files use Prettier code style!' in raw('inner__format.log').decode()
for producer in ('runner.py', 'outer-capture.py', 'scoped-source-inventory.py'):
    assert len(raw('producer__' + producer)) > 100
print('PASS: 44 archived artifacts, 1652 source inputs, 29 dependencies, 135 focused tests, types/lint/build/bundle/format')
