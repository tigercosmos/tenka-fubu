#!/usr/bin/env python3
"""Verify locally retained alliance evidence and state remote-retention limits."""

import gzip
import hashlib
import json
import pathlib
import tarfile


HERE = pathlib.Path(__file__).resolve().parent
EXPECTED_SOURCES = {
    'original': '1457bd1db8ebcf5ab544626299116a40f93cb1de661290582cd4d4c147c96ec7',
    'diagnostic': '36f93527c332a2bb2881f2a3a9ca8c91493649e24a218fc413124b5332d33d4e',
    'candidate-preformat': '501a0c723edf42ca790d3f6e3020461a713b4e311919508cd50a1d72eb8d6ae0',
    'final': 'b97e4f5e62fc2699e2efd84739df7ff36d7785182492cd47e71ecbf8acb1c29b',
}
SOURCE_FILES = {
    'original': 'original-earned-alliance.ts.txt',
    'diagnostic': 'diagnostic-earned-alliance.ts.txt',
    'candidate-preformat': 'candidate-preformat-earned-alliance.ts.txt',
    'final': 'final-earned-alliance.ts.txt',
}
RUNS = {
    'original': ('failed', 1),
    'diagnostic': ('failed', 1),
    'candidate': ('passed', 0),
    'final': ('passed', 0),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text())


def capture_log(name: str) -> str:
    path = HERE / 'captures' / name
    assert read_json(path / 'result.json')['exitCode'] == 0, name
    return gzip.decompress((path / 'stdout-stderr.log.gz').read_bytes()).decode()


sha_lines = (HERE / 'SHA256SUMS').read_text().splitlines()
listed = {}
for line in sha_lines:
    sha, relative = line.split('  ', 1)
    assert relative not in listed and '/' not in pathlib.PurePosixPath(relative).parts[:1]
    listed[relative] = sha
actual = {
    path.relative_to(HERE).as_posix()
    for path in HERE.rglob('*')
    if path.is_file() and path.name not in {'verify.py', 'SHA256SUMS'}
}
assert actual == set(listed), (sorted(actual - set(listed)), sorted(set(listed) - actual))
for relative, sha in listed.items():
    assert digest((HERE / relative).read_bytes()) == sha, relative

for name, sha in EXPECTED_SOURCES.items():
    assert digest((HERE / 'sources' / SOURCE_FILES[name]).read_bytes()) == sha, name

for name, (status, unexpected) in RUNS.items():
    path = HERE / name
    inventory = read_json(path / 'package-inventory.json')
    assert inventory['run'].startswith('alliance-')
    for raw_name, record in inventory['files'].items():
        compressed = (path / f'{raw_name}.gz').read_bytes()
        restored = gzip.decompress(compressed)
        assert len(compressed) == record['gzipBytes']
        assert digest(compressed) == record['gzipSha256']
        assert len(restored) == record['rawBytes']
        assert digest(restored) == record['rawSha256']
    assert digest((path / 'metadata.tar.gz').read_bytes()) == inventory['metadataSha256']
    assert digest((path / 'browser-inventory.json').read_bytes()) == inventory['browserInventorySha256']
    browser = read_json(path / 'browser-inventory.json')
    assert browser['totalFiles'] == len(browser['files'])
    assert browser['totalBytes'] == sum(row['sizeBytes'] for row in browser['files'])
    assert browser['root'].endswith(f"/{inventory['run']}/browser-results")
    with tarfile.open(path / 'metadata.tar.gz') as tar:
        result = json.load(tar.extractfile('result.json'))
        assert result['exitCode'] == (0 if status == 'passed' else 1), name
    report = json.loads(gzip.decompress((path / 'report.json.gz').read_bytes()))
    assert report['config']['globalTimeout'] == 300000
    assert len(report['suites']) == 1 and len(report['suites'][0]['specs']) == 1
    case = report['suites'][0]['specs'][0]['tests'][0]
    assert case['timeout'] == 60000 and case['expectedStatus'] == 'passed'
    assert case['results'][0]['status'] == status
    assert report['stats']['unexpected'] == unexpected
    assert report['stats']['expected'] == 1 - unexpected
    errors = str(case['results'][0].get('error', ''))
    if status == 'failed':
        assert '300' in errors and '299' in errors and 'normalDay' in errors
    if name == 'diagnostic':
        assert '"pendingTicks":0' in errors and '"completedWorkerTicks":30' in errors
        assert '"workerReady":true' in errors and '"wasmBackend":"rust-wasm"' in errors

for name in ('tenka-alliance-final-source-before-1649-c2',
             'tenka-alliance-final-source-after-1649-c2'):
    proof = json.loads(capture_log(name))
    assert proof['revision'].endswith('+earned-alliance-final')
    assert proof['checked'] == 1633 and proof['problems'] == proof['extras'] == []

before_deps = capture_log('tenka-alliance-candidate-deps-after-1649-c1')
after_deps = capture_log('tenka-alliance-final-deps-after-1649-c2')
assert before_deps == after_deps
assert len(before_deps.strip().splitlines()) == 4

fixture = HERE / 'earned-azai-alliance.tfusave'
evidence = HERE / 'earned-azai-alliance.tfusave.evidence.json'
assert digest(fixture.read_bytes()) == '19c4416e15e3b2f0ce31a01a22eeb6236892062f5c8893342d1813165c5459f7'
save = read_json(fixture)
assert save['state']['time']['day'] == 270
assert save['state']['meta']['stateVersion'] == 270
assert len(read_json(evidence)['payments']) == 9

print('PASS: package hashes, four native results, exact day failure, source/deps proofs and fixture; remote browser trees require remote audit')
