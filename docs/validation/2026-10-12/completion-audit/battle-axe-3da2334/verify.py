#!/usr/bin/env python3
"""Verify the retained Battle accessible-name evidence and source inventory."""

import hashlib
import json
import pathlib
import subprocess
import tarfile

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = json.loads((HERE / 'source-manifest.json').read_text())
REVISION = '3da2334688582575bf6e366cac8603c4c2a28200'


def member(archive, name):
    payload = archive.extractfile(name)
    assert payload is not None, name
    return payload.read()


def as_json(archive, name):
    return json.loads(member(archive, name))


def assert_exit(archive, root, run, expected):
    result = as_json(archive, f'{root}/{run}/result.json')
    assert result['exitCode'] == expected, (run, result)


def assert_report(archive, root, run, expected, unexpected=0):
    assert_exit(archive, root, run, 0 if unexpected == 0 else 1)
    stats = as_json(archive, f'{root}/{run}/report.json')['stats']
    assert stats['expected'] == expected and stats['unexpected'] == unexpected, (run, stats)
    assert stats['skipped'] == 0 and stats['flaky'] == 0, (run, stats)


assert SOURCE['revision'] == REVISION
assert len(SOURCE['entries']) == 1632
assert len(SOURCE['deletedPaths']) == 0
repo = HERE.parents[4]
recorded = {}
listing = subprocess.check_output(['git', '-C', str(repo), 'ls-tree', '-r', '-z', REVISION])
for row in listing.split(b'\0'):
    if row:
        metadata, path = row.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        if kind == 'blob':
            recorded[path.decode()] = (mode, oid)
for path, entry in SOURCE['entries'].items():
    assert recorded[path] == (entry['mode'], entry['gitBlob']), path

with tarfile.open(HERE / 'native-raw.tar.gz') as native:
    old = 'tenka-overlays-79682cd/runs/axe-earned-probe'
    candidate = 'tenka-axe-source-8ea'
    assert_report(native, old.rsplit('/', 1)[0], 'axe-earned-probe', 3)
    assert_report(native, candidate, 'axe-battle-candidate', 1)
    before = as_json(native, old + '/browser-results/axe-earned-probe-actual-debug-battle-default-axe-chromium/axe-battle.json')
    after = as_json(native, candidate + '/axe-battle-candidate/browser-results/axe-earned-probe-actual-debug-battle-default-axe-chromium/axe-battle.json')
    serious_before = [v for v in before['violations'] if v['impact'] == 'serious']
    assert [(v['id'], len(v['nodes'])) for v in serious_before] == [('label-content-name-mismatch', 3)]
    assert [v for v in before['violations'] if v['impact'] == 'critical'] == []
    assert after['violations'] == []
    assert any(v['id'] == 'aria-prohibited-attr' for v in before['incomplete'])
    assert not any(v['id'] == 'aria-prohibited-attr' for v in after['incomplete'])
    for run, count in [('battle-core-native', 24), ('layout-viewport-native', 12), ('smoke-native', 5)]:
        assert_report(native, candidate, run, count)
    assert_report(native, candidate, 'old-control-red', 0, 1)
    red_log = member(native, f'{candidate}/old-control-red/stdout-stderr.log').decode()
    assert "getByRole('button', { name: '一倍速 ×1', exact: true })" in red_log
    for name, expected_revision in [('source-before', SOURCE['base']), ('source-final-3da', REVISION)]:
        root = candidate if name == 'source-before' else 'tenka-axe-candidate-8ea'
        record = as_json(native, f'{root}/{name}/stdout-stderr.log')
        assert record['revision'] == expected_revision and record['files'] == 1632 and record['mismatches'] == []
    for run in ('deps-before', 'deps-after'):
        record = as_json(native, f'{candidate}/{run}/stdout-stderr.log')
        assert record['targets'] == 29 and record['mismatches'] == []
    assert_exit(native, candidate, 'build-candidate', 0)
    overlay = as_json(native, f'{candidate}/source-overlay-diff/stdout-stderr.log')
    assert len(overlay['mismatches']) == 10

with tarfile.open(HERE / 'local-raw.tar.gz') as local:
    for run, count in [('tenka-battle-name-baseline', 22), ('tenka-battle-name-count1', 7), ('tenka-battle-name-zero', 0), ('tenka-battle-name-sanity', 22), ('tenka-battle-unit-names-check-green-b867014', 0)]:
        assert member(local, f'{run}/stdout-stderr.log').decode().rstrip().endswith(f'VIOLATIONS: {count}'), run
    assert as_json(local, 'tenka-battle-unit-names-red-b867014/result.json')['exitCode'] == 1
    assert b'Tests  7 failed | 14 passed (21)' in member(local, 'tenka-battle-unit-names-red-b867014/stdout-stderr.log')
    assert as_json(local, 'tenka-battle-unit-names-green-b867014/result.json')['exitCode'] == 0
    assert b'Tests  21 passed (21)' in member(local, 'tenka-battle-unit-names-green-b867014/stdout-stderr.log')
    for run in ('tenka-battle-access-types', 'tenka-battle-access-eslint', 'tenka-battle-access-prettier-check', 'tenka-battle-unit-names-prettier-b867014'):
        assert as_json(local, f'{run}/result.json')['exitCode'] == 0, run

for name in ('native-raw.tar.gz', 'local-raw.tar.gz', 'source-manifest.json'):
    digest = hashlib.sha256((HERE / name).read_bytes()).hexdigest()
    print(f'{digest}  {name}')
print('PASS: 1632 final Git blobs; 29 dependency targets; axe serious 3→0 and critical 0→0; 41 native tests; unit RED 7/14→GREEN 21/21; expanded checker 0')
