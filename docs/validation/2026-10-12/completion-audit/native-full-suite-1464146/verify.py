"""Verify the frozen 1464146 native run and both-run skip classification."""

import gzip
import hashlib
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
PRIOR = HERE.parent / 'native-full-suite-8ea965a'
SHA = {
    'report.json.gz': '4f8d326a8d4abbe8e483c47e72a226a20504bff39a83cb03608bc8360e2150a5',
    'stdout-stderr.log.gz': '212ce7c717e45ed42f91326578a71bc4db36fa9ed06d4e878d731735ad16b1e2',
    'artifact-inventory.json.gz': 'd551ad3e7084ff9eafdf2a64dea6ea9301d37946f5ecc59b2b1bc8980865a9af',
    'remote-meta.tar.gz': 'c34d63566b2862ff40dff60488ea1d2fbc36ba98728df1871ffa6acc9a628b32',
    'local-captures.tar.gz': '054295946fb18f5eee5d7f3235c966b631f35b447d0f5367cb7cf55638b067da',
    'current-skip-audit.json.gz': '99e58957b6d222a8ed0286d28f5cb6ced367551c5340ea6ed28152fadfc0d16c',
    'prior-skip-audit.json.gz': '2a23c80d5501c515765765a34551e42a5c264e18761f371b913c118732421abd',
    'status-delta.json.gz': 'd113d6a38edf3f3bf66ab58bfa8d820fdec0ff3b003bd1a6a22cab92bd19402c',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


for name, expected in SHA.items():
    assert digest((HERE / name).read_bytes()) == expected, name


def archive_read(archive, name):
    stream = archive.extractfile(name)
    assert stream is not None, name
    return stream.read()


def rows(report):
    found = []

    def walk(suite):
        for spec in suite.get('specs', []):
            for test in spec['tests']:
                found.append({
                    'file': Path(spec['file']).name,
                    'title': spec['title'],
                    'results': [result['status'] for result in test['results']],
                })
        for child in suite.get('suites', []):
            walk(child)

    for suite in report['suites']:
        walk(suite)
    return found


def check_skip_audit(report, audit, total, statuses, no_result, other_skipped):
    cases = rows(report)
    assert len(cases) == total == audit['discovered']
    assert sum(not case['results'] for case in cases) == no_result == audit['notDispatched']
    assert {status: sum(case['results'] == [status] for case in cases)
            for status in statuses} == statuses == audit['resultStatuses']
    assert len(audit['terminalInterrupted']) == 7
    for entry in audit['terminalInterrupted']:
        matches = [case for case in cases if case['file'] == entry['file']
                   and case['title'] == entry['title']]
        assert len(matches) == 1 and matches[0]['results'] == ['skipped'], entry
    assert statuses['skipped'] - 7 == other_skipped == audit['otherSkipped']
    return cases


with gzip.open(HERE / 'report.json.gz', 'rt') as stream:
    current_report = json.load(stream)
with gzip.open(PRIOR / 'report.json.gz', 'rt') as stream:
    prior_report = json.load(stream)
with gzip.open(HERE / 'current-skip-audit.json.gz', 'rt') as stream:
    current_audit = json.load(stream)
with gzip.open(HERE / 'prior-skip-audit.json.gz', 'rt') as stream:
    prior_audit = json.load(stream)
current = check_skip_audit(
    current_report, current_audit, 363,
    {'passed': 226, 'failed': 15, 'timedOut': 3, 'skipped': 36}, 83, 29,
)
check_skip_audit(
    prior_report, prior_audit, 362,
    {'passed': 222, 'failed': 18, 'timedOut': 3, 'skipped': 34}, 85, 27,
)
assert current_report['stats']['duration'] == 300015.168
assert current_report['stats']['skipped'] == 119
assert current_report['stats']['unexpected'] == 18

with gzip.open(HERE / 'status-delta.json.gz', 'rt') as stream:
    delta = json.load(stream)
assert delta['priorCount'] == 362 and delta['currentCount'] == 363
assert len(delta['added']) == 1 and len(delta['removed']) == 0
assert delta['added'][0]['file'] == 'battle-controls-acceptance.spec.ts'
assert delta['added'][0]['status'] == 'passed'
assert {row['file'] for row in delta['newUnexpected']} == {
    'army-plate-material.spec.ts', 'context-panel-focus.spec.ts'
}
assert {row['file'] for row in delta['clearedUnexpected']} == {
    'actor-depth-layout.spec.ts', 'army-plate-layout.spec.ts',
    'coast-surface-layout.spec.ts', 'earned-regional-ending.spec.ts'
}
assert sum(row['after'] == 'skipped' for row in delta['clearedUnexpected']) == 2

with gzip.open(HERE / 'artifact-inventory.json.gz', 'rt') as stream:
    inventory = json.load(stream)
assert inventory['totalFiles'] == 27398
assert inventory['totalBytes'] == 5373903660
assert len(inventory['files']) == inventory['totalFiles']
assert sum(row['sizeBytes'] for row in inventory['files']) == inventory['totalBytes']

with tarfile.open(HERE / 'remote-meta.tar.gz') as remote:
    manifest = json.loads(archive_read(remote, 'full-native-146-manifest.json'))
    assert manifest['revision'] == '146414688dc2ceceb81042aeed6984ddf0687926'
    assert manifest['archivePaths'] == [
        'e2e/actor-depth-layout.spec.ts', 'e2e/earned-regional-ending.spec.ts'
    ]
    assert manifest['deletedPaths'] == []
    assert digest(archive_read(remote, 'full-native-146-delta.tar')) == manifest['archiveSha256']
    command = json.loads(archive_read(remote, 'full-native-146-original-c1/command.json'))
    argv = command['argv']
    assert argv[:3] == [
        '/tmp/tenka-fubu-parallel-20261011.FC6Shj/runtime/bin/node',
        'node_modules/@playwright/test/cli.js', 'test'
    ]
    assert not any(arg.startswith(('--workers', '--timeout', '--global-timeout')) for arg in argv)
    assert json.loads(archive_read(remote, 'full-native-146-original-c1/result.json'))['exitCode'] == 1
    assert json.loads(archive_read(remote, 'full-native-146-build-c1/result.json'))['exitCode'] == 0
    child_log = archive_read(remote, 'full-native-146-original-c1/browser-results/earned-regional-worker-3/earned-regional-route-generation.log')
    assert b'Test timed out in 5000ms' in child_log
    assert b'6719' in child_log
    assert gzip.decompress((HERE / 'stdout-stderr.log.gz').read_bytes()) == archive_read(
        remote, 'full-native-146-original-c1/stdout-stderr.log'
    )

with tarfile.open(HERE / 'local-captures.tar.gz') as local:
    for name in ['tenka-ending-full-source-before-run-146-c1',
                 'tenka-ending-full-source-after-146-c1']:
        proof = json.loads(archive_read(local, name + '/stdout-stderr.log'))
        assert proof['revision'] == manifest['revision']
        assert proof['checked'] == 1632 and proof['problems'] == [] and proof['extras'] == []
    after = archive_read(local, 'tenka-ending-full-deps-after-146-c1/stdout-stderr.log').decode()
    before = archive_read(local, 'tenka-ending-full-remote-delta-hash-146-c1/stdout-stderr.log').decode()
    for value in [
        '63f021d39b353a70831accbfc50b714a09767b900ce23157fbf4ecce1dda7be1',
        '6b840268612656f0639fb7d68782e8353bdf11518589d30ddf66f283c2670ed5',
        '6ea35e567829660d9832744086c18526b9ddebd5358c4a0cadfb0a355925f917',
        '30a5d76198947099a2a50cbf8800f4ec13304a208cda1c2e6beaac432d3afe87',
    ]:
        assert value in before and value in after
    assert not archive_read(local, 'tenka-ending-full-postprocess-146-c2/stdout-stderr.log').strip()

for path in manifest['archivePaths']:
    data = (ROOT / path).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert blob == manifest['entries'][path]['gitBlob'], path
print('PASS: frozen source/dependencies, original full run, external inventory, both-run skip correction')
