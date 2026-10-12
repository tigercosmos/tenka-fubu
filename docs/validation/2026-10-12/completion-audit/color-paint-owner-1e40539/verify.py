#!/usr/bin/env python3
"""Verify local color paint-owner evidence; remote trees require remote audit."""

import gzip
import hashlib
import json
import pathlib
import tarfile

from PIL import Image


HERE = pathlib.Path(__file__).resolve().parent
SOURCE_SHAS = {
    'original-color-vision-map.ts.txt': 'bf23cc2dc5f2af55039944ce99b1ca1f119c77ddc6a7c33d1e0fabace5d15435',
    'diagnostic-paint-owner.ts.txt': '711e6cd2f8529ee38c2426c4dc419a2c544e1eb2edd549ea719b1b1d71c1d8b4',
}
RUNS = {'diagnostic': ('color-owner-1e40539-c1', 0),
        'original': ('color-original-achromatopsia-1e40539-c1', 1)}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text())


listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    sha, relative = line.split('  ', 1)
    assert relative not in listed
    listed[relative] = sha
actual = {path.relative_to(HERE).as_posix() for path in HERE.rglob('*')
          if path.is_file() and path.name not in {'verify.py', 'SHA256SUMS'}}
assert actual == set(listed), (sorted(actual - set(listed)), sorted(set(listed) - actual))
for relative, sha in listed.items():
    assert digest((HERE / relative).read_bytes()) == sha, relative

for filename, sha in SOURCE_SHAS.items():
    assert digest((HERE / 'sources' / filename).read_bytes()) == sha
manifest = read_json(HERE / 'frozen-source-manifest.json')
assert manifest['revision'].endswith('+earned-alliance-final')
assert len(manifest['entries']) == 1633

for label, (name, exit_code) in RUNS.items():
    directory = HERE / label
    package = read_json(directory / 'package-inventory.json')
    browser = read_json(directory / 'browser-inventory.json')
    assert package['run'] == name and browser['root'].endswith(f'/{name}/browser-results')
    assert browser['totalFiles'] == len(browser['files'])
    assert browser['totalBytes'] == sum(row['sizeBytes'] for row in browser['files'])
    assert digest((directory / 'browser-inventory.json').read_bytes()) == package['browserInventorySha256']
    assert digest((directory / 'metadata.tar.gz').read_bytes()) == package['metadataSha256']
    with tarfile.open(directory / 'metadata.tar.gz') as tar:
        result = json.load(tar.extractfile('result.json'))
        assert result['exitCode'] == exit_code
    for basename, record in package['files'].items():
        compressed = (directory / (basename + '.gz')).read_bytes()
        raw = gzip.decompress(compressed)
        assert len(compressed) == record['gzipBytes'] and digest(compressed) == record['gzipSha256']
        assert len(raw) == record['rawBytes'] and digest(raw) == record['rawSha256']
    report = json.loads(gzip.decompress((directory / 'report.json.gz').read_bytes()))
    assert report['config']['globalTimeout'] == 300000
    assert len(report['suites']) == 1 and len(report['suites'][0]['specs']) == 1
    case = report['suites'][0]['specs'][0]['tests'][0]
    assert case['timeout'] == 60000 and len(case['results']) == 1
    assert case['results'][0]['status'] == ('failed' if exit_code else 'passed')
    assert report['stats']['unexpected'] == exit_code
    if label == 'original':
        error = case['results'][0]['error']['message']
        assert 'restoring none must recover exact RGBA pixels' in error
        assert 'Received:' in error and '9' in error
    selected = directory / 'browser-selected'
    rows = {row['path']: row for row in browser['files']}
    expected = {path for path in rows if path.endswith('.png') or
                (path.endswith('.json') and not path.endswith('.last-run.json'))}
    observed = set()
    for path in selected.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(selected).as_posix()
        raw_relative = relative[:-3] if relative.endswith('.json.gz') else relative
        assert raw_relative in expected
        raw = gzip.decompress(path.read_bytes()) if relative.endswith('.json.gz') else path.read_bytes()
        assert len(raw) == rows[raw_relative]['sizeBytes']
        assert digest(raw) == rows[raw_relative]['sha256']
        observed.add(raw_relative)
    assert observed == expected, (label, sorted(expected - observed))

original = HERE / 'original' / 'browser-selected'
none = next(original.rglob('overview-none.png'))
restored = next(original.rglob('overview-restored.png'))
left, right = Image.open(none).convert('RGBA'), Image.open(restored).convert('RGBA')
assert left.size == right.size == (1280, 720)
changes = [(x, y) for y in range(720) for x in range(1280)
           if left.getpixel((x, y)) != right.getpixel((x, y))]
assert len(changes) == 9
assert set(changes) == {(1120, 16), (1215, 16), (1225, 16), (1120, 17),
                        (1215, 17), (1120, 46), (1215, 46), (1120, 47), (1215, 47)}
before = json.load(gzip.open(next(original.rglob('overview-none-observation.json.gz')), 'rt'))
after = json.load(gzip.open(next(original.rglob('overview-restored-observation.json.gz')), 'rt'))
for key in ('state', 'commands', 'canvas'):
    assert before[key] == after[key], key
assert {key for key in before['diagnostics'] if before['diagnostics'][key] != after['diagnostics'][key]} == {'ticker'}

diagnostic = HERE / 'diagnostic' / 'browser-selected'
owner = json.load(gzip.open(next(diagnostic.rglob('owner-report.json.gz')), 'rt'))
for name, restored_count in [('shadow', 11), ('noShadow', 6), ('hidden', 0)]:
    stage = owner['comparison'][name]
    assert stage['noCdp']['total'] == 0
    assert stage['altered']['total'] == 921600
    assert stage['restored']['total'] == restored_count
    assert stage['restored']['seam'] == 0
assert all(not record['valid'] and record['colors'] == 1 for record in owner['raw'].values())
for view in owner['views'].values():
    assert view['canvas']['rect'] == [0, 0, 1280, 720]
    assert view['hud']['rect'] == [12, 8, 1256, 48]
    assert view['rail']['rect'] == [8, 64, 64, 644]
    assert view['stateVersion'] == 0

with tarfile.open(HERE / 'captures.tar.gz') as tar:
    def capture(name: str):
        return json.load(tar.extractfile(f'{name}/stdout-stderr.log'))
    before_proof = capture('tenka-color-owner-source-before-1e40539-c1')
    after_proof = capture('tenka-color-owner-source-after-1e40539-c1')
    assert before_proof['checked'] == after_proof['checked'] == 1633
    assert before_proof['problems'] == after_proof['problems'] == []
    assert before_proof['extras'] == []
    assert after_proof['extras'] == ['e2e/color-paint-owner-diagnostic.spec.ts']
    before_deps = tar.extractfile('tenka-alliance-final-deps-after-1649-c2/stdout-stderr.log').read()
    after_deps = tar.extractfile('tenka-color-owner-deps-after-1e40539-c1/stdout-stderr.log').read()
    assert before_deps == after_deps
    source_sha = tar.extractfile('tenka-color-testsource-1e40539-c1/stdout-stderr.log').read().decode()
    assert all(sha in source_sha for sha in SOURCE_SHAS.values())
    process = tar.extractfile('tenka-color-process-after-1e40539-c1/stdout-stderr.log').read().decode()
    assert len(process.splitlines()) == 2 and 'bash -c' in process.splitlines()[1]

print('PASS: both native outcomes, 9 original pixels, 11/6/0 diagnostic, sources/deps and selected raw outputs; full browser trees require remote audit')
