#!/usr/bin/env python3
"""Verify the complete frozen 9550 native report and compact provenance."""

import collections
import gzip
import hashlib
import json
import re
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HASHES = {
    'report.json.gz': 'f1905d0feb1a98bb862a7a0a84b663a2eb751acd70ff1509dee466a2cfa8985b',
    'terminal.log.gz': 'e12fc4687bcbe89cceeb3d15ee80ec5be93f91364f94af5bfeed31ed1e843190',
    'analysis.json': '249d96386ad1b31c9214c05f2494fbe5153ac2692a71da0005d117c08702cde7',
    'browser-inventory.json': '2eacba863027f3cfc0cb99e0f38110cd8c67d6fd2ca4f49b15a46033ead9b42a',
    'metadata.tar.gz': '9c942e93209acec8a8bb6185ffc58cb138a44b5586357ba3a04a38641ceb8599',
}
for name, digest in HASHES.items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name

with gzip.open(ROOT / 'report.json.gz', 'rt') as stream:
    report = json.load(stream)
with gzip.open(ROOT / 'terminal.log.gz', 'rt') as stream:
    terminal = stream.read()
analysis = json.loads((ROOT / 'analysis.json').read_text())
inventory = json.loads((ROOT / 'browser-inventory.json').read_text())

assert report['stats'] == {
    'startTime': '2026-10-12T12:39:36.806Z',
    'duration': 300002.108,
    'expected': 257,
    'skipped': 169,
    'unexpected': 14,
    'flaky': 0,
}
assert analysis['stats'] == report['stats']
assert analysis['discovered'] == len(analysis['rows']) == 440
assert analysis['categories'] == {
    'failed': 11,
    'notDispatched': 133,
    'otherSkipped': 31,
    'passed': 257,
    'terminalInterrupted': 5,
    'timedOut': 3,
}
assert analysis['resultLengths'] == {'0': 133, '1': 307}

actual = []


def walk(suite, parent=()):
    title = suite.get('title')
    prefix = parent if suite.get('file') else parent + ((title,) if title else ())
    for spec in suite.get('specs', []):
        for test in spec['tests']:
            actual.append((
                ('chromium', spec['file'], spec['line'], spec['column'], *prefix, spec['title']),
                test['status'],
                test['expectedStatus'],
                tuple(result['status'] for result in test['results']),
                tuple(result.get('duration') for result in test['results']),
            ))
    for child in suite.get('suites', []):
        walk(child, prefix)


for suite in report['suites']:
    walk(suite)
assert len(actual) == len(set(row[0] for row in actual)) == 440
saved = [(
    tuple(row['key']), row['reportStatus'], row['expectedStatus'],
    tuple(row['results']), tuple(row['durationsMs']),
) for row in analysis['rows']]
assert sorted(actual) == sorted(saved), 'raw report and every derived row disagree'

pattern = re.compile(
    r'^  \d+\) \[([^]]+)\] › ([^\n]+?)\s*\n\n    Test was interrupted\.', re.M,
)
terminal_titles = pattern.findall(terminal)
assert len(terminal_titles) == 5
for project, decorated in terminal_titles:
    undecorated = re.sub(r'\s+─+\s*$', '', decorated)
    segments = undecorated.split(' › ')
    locator = re.fullmatch(r'(.+?):(\d+):(\d+)', segments[0])
    assert locator is not None, decorated
    file, line, column = locator.groups()
    matches = [row for row in analysis['rows']
               if row['project'] == project
               and Path(row['file']).name == Path(file).name
               and row['line'] == int(line)
               and row['column'] == int(column)
               and row['titlePath'] == segments[1:]]
    assert len(matches) == 1 and matches[0]['category'] == 'terminalInterrupted'
    assert matches[0]['results'] == ['skipped']
assert collections.Counter(row['category'] for row in analysis['rows']) == analysis['categories']

assert inventory['count'] == len(inventory['files']) == 25033
assert inventory['totalBytes'] == sum(item['size'] for item in inventory['files']) == 5091172298
assert len({item['path'] for item in inventory['files']}) == inventory['count']
assert all(re.fullmatch('[0-9a-f]{64}', item['sha256']) for item in inventory['files'])


def read(archive, path):
    member = archive.extractfile(path)
    assert member is not None, path
    return member.read()


def obj(archive, path):
    return json.loads(read(archive, path))


with tarfile.open(ROOT / 'metadata.tar.gz') as archive:
    prefix = 'tenka-fullnative-9550-'
    for suffix in (
        'remove-derivative-c1', 'preflight-c1', 'source-before-c1',
        'deps-before-c1', 'discovery-c1', 'source-after-c1',
        'deps-after-c1', 'process-after-c1', 'parse-c1',
        'compress-c1', 'inventory-c1',
    ):
        assert obj(archive, f'{prefix}{suffix}/result.json')['exitCode'] == 0, suffix
    assert obj(archive, 'result.json')['exitCode'] == 1
    assert obj(archive, 'command.json')['cwd'] == '/tmp/tenka-fullnative-phase-9550-c1'
    assert 'Running 440 tests using 16 workers' in terminal
    assert 'Total: 440 tests in 106 files' in read(
        archive, f'{prefix}discovery-c1/stdout-stderr.log').decode()

    source_before = obj(archive, f'{prefix}source-before-c1/stdout-stderr.log')
    source_after = obj(archive, f'{prefix}source-after-c1/stdout-stderr.log')
    for proof in (source_before, source_after):
        assert proof['revision'] == '9550e397568ff448689bc5904ec0651b04bfe717'
        assert proof['matchedGitBlobs'] == 1648
        assert proof['extra'] == []
        assert proof['packageLockSha256'] == '63f021d39b353a70831accbfc50b714a09767b900ce23157fbf4ecce1dda7be1'
        assert proof['distIndexSha256'] == '2eaae0b72257668342bc82e46012a4312c810a9476a48d90f5324895835e074c'
    dependencies_before = obj(archive, f'{prefix}deps-before-c1/stdout-stderr.log')
    dependencies_after = obj(archive, f'{prefix}deps-after-c1/stdout-stderr.log')
    assert dependencies_before == dependencies_after
    assert dependencies_before['pixiTargetCount'] == len(dependencies_before['pixiTargets']) == 29
    assert dependencies_before['lockSha256'] == source_before['packageLockSha256']
    assert 'Test timed out in 5000ms.' in read(
        archive, 'earned-regional-worker-17/earned-regional-route-generation.log').decode()

print('PASS: 440 raw titles, exact interruption split, source/dependency bracket, inventory and archives')
