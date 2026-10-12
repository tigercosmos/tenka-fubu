"""Verify retained local color-normalization evidence without contacting sim4."""

import hashlib
import json
import pathlib
import tarfile

HERE = pathlib.Path(__file__).resolve().parent


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    expected, rel = line.split('  ', 1)
    assert sha((HERE / rel).read_bytes()) == expected, rel

manifest = json.loads((HERE / 'local-manifest.json').read_text())
assert len(manifest['captureDirs']) == 70
assert manifest['sources']['original-color-vision-map.ts.txt']['sha256'] == (
    'bf23cc2dc5f2af55039944ce99b1ca1f119c77ddc6a7c33d1e0fabace5d15435'
)
for name, spec in manifest['sources'].items():
    raw = (HERE / 'sources' / name).read_bytes()
    assert len(raw) == spec['bytes'] and sha(raw) == spec['sha256'], name

cases = {
    'color-priming-achromatopsia-e4-c1': (1, 293),
    'color-repaint-achromatopsia-e4-c1': (1, 385),
    'color-consecutive-achromatopsia-e4-c1': (0, None),
}
for name, (exit_code, received) in cases.items():
    inventory = json.loads((HERE / f'{name}-inventory.json').read_text())
    assert inventory['remoteRoot'] == f'/tmp/tenka-battle-79682cd/runs/{name}'
    indexed = {item['path']: item for item in inventory['files']}
    assert len(indexed) == len(inventory['files'])
    with tarfile.open(HERE / f'{name}.tar.gz', 'r:gz') as archive:
        archived = {item.name: item for item in archive if item.isfile()}
        assert set(archived) == {
            rel for rel, spec in indexed.items() if spec['inCompactArchive']
        }, name
        for rel, item in archived.items():
            raw = archive.extractfile(item).read()
            assert len(raw) == indexed[rel]['bytes'] and sha(raw) == indexed[rel]['sha256'], rel
        result = json.load(archive.extractfile('result.json'))
        report = json.load(archive.extractfile('report.json'))
        log = archive.extractfile('stdout-stderr.log').read().decode()
        assert result['exitCode'] == exit_code
        assert report['stats']['unexpected'] == (1 if exit_code else 0)
        if received is not None:
            assert f'Received: {received}' in log
        if name.startswith('color-consecutive'):
            line = next(line for line in log.splitlines() if line.startswith('CONSECUTIVE_DIAGNOSTIC '))
            diagnostic = json.loads(line.split(' ', 1)[1])
            assert [pair['count'] for pair in diagnostic['baselinePairs'] if pair['j'] == pair['i'] + 1] == [289, 285, 134, 124]
            assert [pair['count'] for pair in diagnostic['restoredPairs'] if pair['j'] == pair['i'] + 1] == [385, 18, 0, 0]
            assert len(diagnostic['cross']) == 25
            assert min(pair['count'] for pair in diagnostic['cross']) == 246
            assert diagnostic['modeChange'] == 921600
        else:
            assert any(rel.endswith('trace.zip') and not spec['inCompactArchive'] for rel, spec in indexed.items())

with tarfile.open(HERE / 'local-captures.tar.gz', 'r:gz') as archive:
    names = set(archive.getnames())
    for capture in manifest['captureDirs']:
        assert f'{capture}/command.json' in names
        assert f'{capture}/result.json' in names
        assert f'{capture}/stdout-stderr.log' in names
    final = json.load(archive.extractfile('tenka-color-normal-final-source-e4-c1/stdout-stderr.log'))
    assert final['revision'] == 'e4e5521217aa14d0765b5aeb71ab2c7fd687640f'
    assert final['checked'] == 1633 and final['problems'] == [] and final['extras'] == []
    collision = json.load(archive.extractfile('tenka-color-normal-transfer-e4-dummy-collision-mkdir/result.json'))
    assert collision['exitCode'] == 1
    unchanged = archive.extractfile('tenka-color-normal-collision-unchanged-e4-c1/stdout-stderr.log').read().decode()
    assert 'd49c32c26d2795c20227553193e69f1d735bd80d5fcb60aa682542af73a0cc51' in unchanged
    assert '6e485a4bdba8df91daf7bdebfdd0c165cfc2af2c415a680a086de3689f7d72de' in unchanged

old_inventory = (HERE / 'old-scratch-preoverwrite-inventory.log.txt').read_text()
assert '225504 Oct 12 17:50 manifest.json' in old_inventory
assert '184320 Oct 12 17:50 source.tar' in old_inventory
print('verified: 3 native captures, 70 local captures, fixed 5+5 matrix, final source, transfer collision')
