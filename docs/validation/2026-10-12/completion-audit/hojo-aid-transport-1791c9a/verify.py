#!/usr/bin/env python3
"""Verify the retained Hojo positive-aid native route and source provenance."""

import base64
import hashlib
import json
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
BASE = 'e4e5521217aa14d0765b5aeb71ab2c7fd687640f'
ADOPTED = '1791c9a0bf3e976f536fa65e1fb9d6dbe7429876'
CASE = 'earned Hojo military aid: paid native work, agreement, actual AI march and ordinary movement'
TEST = 'e2e/earned-hojo-aid.spec.ts'
RUNS = [f'tenka-hojo-transport-native-e4-v{number}' for number in (1, 2, 3)]


def captured(command):
    run = Path(tempfile.mkdtemp(prefix='tenka-hojo-transport-verify-'))
    with (run / 'command.json').open('x') as out:
        json.dump({'argv': command, 'cwd': str(REPO)}, out)
    with (run / 'stdout').open('xb') as stdout, (run / 'stderr').open('xb') as stderr:
        result = subprocess.run(command, cwd=REPO, stdout=stdout, stderr=stderr)
    with (run / 'result.json').open('x') as out:
        json.dump({'exitCode': result.returncode}, out)
    result.check_returncode()
    return (run / 'stdout').read_bytes()


manifest = json.loads((HERE / 'base-manifest.json').read_text())
assert manifest['revision'] == BASE and len(manifest['entries']) == 1633
assert manifest['archivePaths'] == ['CLAUDE.md', 'e2e/earned-alliance.spec.ts']
tracked = {}
for row in captured(['git', 'ls-tree', '-rz', BASE]).split(b'\0'):
    if row:
        meta, name = row.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        tracked[name.decode()] = {'mode': mode, 'gitBlob': oid}
assert all(tracked[name] == row for name, row in manifest['entries'].items())
assert captured(['git', 'rev-parse', f'{ADOPTED}^']).decode().strip() == BASE
assert captured(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', ADOPTED]).decode().splitlines() == [TEST]
adopted = captured(['git', 'show', f'{ADOPTED}:{TEST}'])

needed = {f'{run}/{name}' for run in RUNS for name in ('result.json', 'stdout-stderr.log')}
needed.update({
    'tenka-hojo-transport-native-e4-v3/report.json',
    'tenka-hojo-e4-overlay-v3/tenka-hojo-transport-probe-e4-v3.spec.ts',
    'tenka-hojo-e4-overlay-v3/probe-before-fingerprint.json',
    'tenka-hojo-e4-overlay-v3/probe-after-fingerprint.json',
    'tenka-hojo-e4-overlay-v1/probe-before-fingerprint.json',
    'tenka-hojo-e4-overlay-v2/probe-before-fingerprint.json',
    'tenka-hojo-transport-native-e4-v2/browser-results/earned-hojo-aid-earned-Hoj-a4dd6-march-and-ordinary-movement-chromium/error-context.md',
})
raw = {}
with tarfile.open(HERE / 'native-raw.tar.gz', 'r:gz') as archive:
    for member in archive:
        if member.name in needed:
            source = archive.extractfile(member)
            assert source is not None, member.name
            raw[member.name] = source.read()
assert set(raw) == needed


def native(name):
    return raw[f'tenka-hojo-transport-native-e4-{name}']


for index, run in enumerate(RUNS):
    code = json.loads(raw[f'{run}/result.json'])['exitCode']
    assert code == ([1, 1, 0][index]), (run, code)
log1 = raw[f'{RUNS[0]}/stdout-stderr.log'].decode()
log2 = raw[f'{RUNS[1]}/stdout-stderr.log'].decode()
log3 = raw[f'{RUNS[2]}/stdout-stderr.log'].decode()
assert 'Expected: 119' in log1 and 'Received: 120' in log1
assert 'getByLabel(\'援軍對抗勢力\', { exact: true })' in log2
assert 'Test timeout of 60000ms exceeded' in log2
assert '1 passed' in log3
context2 = raw[next(name for name in needed if name.endswith('v2/browser-results/earned-hojo-aid-earned-Hoj-a4dd6-march-and-ordinary-movement-chromium/error-context.md'))].decode()
assert 'combobox "援軍對抗勢力"' in context2

candidate = raw['tenka-hojo-e4-overlay-v3/tenka-hojo-transport-probe-e4-v3.spec.ts']
probe_sha = hashlib.sha256(candidate).hexdigest()
before = json.loads(raw['tenka-hojo-e4-overlay-v3/probe-before-fingerprint.json'])
after = json.loads(raw['tenka-hojo-e4-overlay-v3/probe-after-fingerprint.json'])
for fingerprint in (before, after):
    assert fingerprint['revision'] == BASE
    assert fingerprint['checked'] == 1633 and fingerprint['mismatches'] == []
    assert fingerprint['pixiFiles'] == 3695
    assert fingerprint['probeSha256'] == probe_sha
assert before['pixiSha256'] == after['pixiSha256']
for version in ('v1', 'v2'):
    earlier = json.loads(raw[f'tenka-hojo-e4-overlay-{version}/probe-before-fingerprint.json'])
    assert earlier['revision'] == BASE and earlier['checked'] == 1633
    assert earlier['mismatches'] == [] and earlier['pixiFiles'] == 3695

with tarfile.open(HERE / 'local-raw.tar.gz', 'r:gz') as archive:
    rows = json.loads(archive.extractfile('tenka-hojo-ast-identity-e4-v2/stdout-stderr.log').read())
    route = json.loads(archive.extractfile('tenka-hojo-route-audit-day90-e4-v1/stdout-stderr.log').read())
    route120 = json.loads(archive.extractfile('tenka-hojo-route-audit-e4-v1/stdout-stderr.log').read())
assert len(rows) == 2 and rows[0]['sha256'] == rows[1]['sha256']
assert rows[0]['path'].endswith('tenka-hojo-transport-probe-e4-v3.spec.ts')
assert rows[1]['path'] == TEST
assert "getByRole('combobox', { name: '援軍對抗勢力', exact: true })".encode() in adopted
assert "getByLabel('援軍對抗勢力', { exact: true })".encode() not in adopted
valid_routes = [trial for trial in route['trials'] if trial['from'] == 'castle.tsutsujigasaki'
                and trial['to'] == 'castle.fukashi' and trial['soldiers'] == 1500]
assert len(valid_routes) == 1 and valid_routes[0]['validity']['ok']
assert valid_routes[0]['path'] == ['castle.tsutsujigasaki', 'castle.takato', 'castle.fukashi']
fresh120 = [trial for trial in route120['trials'] if trial['from'] == 'castle.tsutsujigasaki'
            and trial['to'] == 'castle.fukashi' and trial['soldiers'] == 1500]
assert len(fresh120) == 1 and fresh120[0]['afterScore'] > 0.5

report = json.loads(raw[f'{RUNS[2]}/report.json'])
cases = [test for suite in report['suites'] for spec in suite.get('specs', [])
         if spec['title'] == CASE for test in spec['tests']]
assert len(cases) == 1 and cases[0]['status'] == 'expected'
results = cases[0]['results']
assert len(results) == 1 and results[0]['status'] == 'passed'
assert results[0]['duration'] == 54705
attachment = next(item for item in results[0]['attachments']
                  if item.get('name') == 'earned-hojo-aid-full-evidence')
evidence = json.loads(base64.b64decode(attachment['body']))
assert len(evidence['daily']) == 123
stages = {row['stage']: row for row in evidence['evidence'] if isinstance(row, dict)}
assert stages['lawful-transport-queued']['current']['time']['day'] == 90
applied = stages['lawful-transport-applied']
assert applied['current']['time']['day'] == 120
assert applied['command']['command'] == {
    'type': 'transport', 'clanId': 'clan.takeda',
    'fromCastleId': 'castle.tsutsujigasaki', 'toCastleId': 'castle.fukashi',
    'soldiers': 1500, 'gold': 0, 'food': 0,
}
eligible = stages['earned-eligibility']
assert len(eligible['payments']) == 4
assert eligible['current']['time']['day'] == 120
assert eligible['score'] == 0.5065831409217308
cache = eligible['current']['ai']['clans']['clan.hojo']['threatCache']
assert cache['computedDay'] == 120 and cache['totalThreat'] == 1.874259686840598
movement = stages['actual-aid-movement']
assert movement['state']['time']['day'] == 123
assert movement['beforeMove']['id'] == movement['afterMove']['id'] == 'army.000011'
assert movement['beforeMove']['posNodeId'] == 'castle.matsuyama'
assert movement['afterMove']['posNodeId'] == 'castle.minowa'
assert any(row['event']['type'] == 'diplo.reinforceAgreed' and row['event']['day'] == 121
           for row in movement['state']['reports'])
aid = [row for row in movement['state']['ai']['intentLog']
       if row['day'] == 121 and row['kind'] == 'diplo.aid' and row['clanId'] == 'clan.hojo']
assert len(aid) == 1 and len(aid[0]['commands']) == 5
assert all(command['type'] == 'march' and command['targetNodeId'] == 'castle.minowa'
           for command in aid[0]['commands'])

listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    listed[name] = digest
assert set(listed) == {path.name for path in HERE.iterdir()
                       if path.is_file() and path.name != 'SHA256SUMS'}
for name, digest in listed.items():
    hasher = hashlib.sha256()
    with (HERE / name).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(chunk)
    assert hasher.hexdigest() == digest, name
print('Hojo aid PASS: two preserved REDs, lawful transport, actual positive AI aid and movement, source/dependency pins')
