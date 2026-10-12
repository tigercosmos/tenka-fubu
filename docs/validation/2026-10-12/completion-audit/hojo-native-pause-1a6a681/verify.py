#!/usr/bin/env python3
"""Verify compact Hojo native-pause evidence and its recorded scope."""
import gzip
import hashlib
import json
import subprocess
import tarfile
from pathlib import Path

package = Path(__file__).resolve().parent
repo = package.parents[4]
manifest = json.loads((package / 'manifest.json').read_text())
for rel, expected in manifest.items():
    data = (package / rel).read_bytes()
    assert len(data) == expected['size'], rel
    assert hashlib.sha256(data).hexdigest() == expected['sha256'], rel
assert {p.relative_to(package).as_posix() for p in (package / 'raw').iterdir()} == set(manifest)

with tarfile.open(package / 'raw/remote-captures.tar.gz', 'r:gz') as archive:
    def remote(name):
        return archive.extractfile(name).read()
    for stage in ('source-before', 'source-after'):
        prefix = f'tenka-hojo-{stage}-4dd-c1'
        proof = json.loads(remote(f'{prefix}/stdout-stderr.log'))
        assert proof['passed'] and not proof['bad'] and not proof['extras'] and not proof['missing']
        assert proof['revision'] == '4dd1a55443e6b5c134a065b192a5623a7160a8de'
        assert proof['sourceEntries'] == 1650
        assert proof['overlay'] == {'e2e/earned-hojo-aid.spec.ts': '580a62dc7bb751640b8f0b5b23f970ce88b95a96608c93da6b286ee0d648e639'}
        assert len(proof['dependencies']) == 29
        assert all(x['expected'] == x['actual'] for x in proof['dependencies'])
        assert json.loads(remote(f'{prefix}/result.json'))['exitCode'] == 0
    for name in ('build', 'list', 'case'):
        prefix = f'tenka-hojo-{name}-4dd-c1'
        assert json.loads(remote(f'{prefix}/result.json'))['exitCode'] == 0
    assert b'Running 1 test using 1 worker' in remote('tenka-hojo-case-4dd-c1/stdout-stderr.log')
    assert b'1 passed (56.0s)' in remote('tenka-hojo-case-4dd-c1/stdout-stderr.log')
    assert b'Total: 1 test in 1 file' in remote('tenka-hojo-list-4dd-c1/stdout-stderr.log')

summary = json.loads((package / 'raw/candidate-summary.json').read_text())
assert summary['testStatus'] == 'passed' and summary['suiteStats']['unexpected'] == 0
assert summary['dailyCount'] == 123 and summary['firstDay'] == 1 and summary['lastDay'] == 123
assert summary['consecutiveDays'] and len(summary['evidence']) == 7
assert summary['decisions'].count('summary:continue') == 4
assert summary['evidence'][-1]['stage'] == 'actual-aid-movement'
transport = json.loads((package / 'raw/transport-command.json').read_text())
assert transport['snapshotDay'] == 120 and transport['command']['day'] == 91
trace = json.loads((package / 'raw/original-trace-events.json').read_text())
lookup = {(e['callId'], e['type']): e for e in trace}
assert lookup['pw:api@154', 'after']['endTime'] == 137433.768
assert lookup['pw:api@157', 'after']['endTime'] - lookup['pw:api@157', 'before']['startTime'] > 800
retained = json.loads((package / 'raw/remote-retention.json').read_text())
assert retained['candidateReport']['sha256'] == 'c1f2e42973e7cde9f3fc3808a8425c08f50ca39e733803c67180d428e1f53174'
assert retained['originalTrace']['sha256'] == 'f2058ab0eaa88cc3f74177e9de351594dcf8577042b20e0329ad6c55f42d35aa'
source = subprocess.run(['git', 'show', '1a6a681:e2e/earned-hojo-aid.spec.ts'], cwd=repo, capture_output=True, check=True).stdout
assert hashlib.sha256(source).hexdigest() == '580a62dc7bb751640b8f0b5b23f970ce88b95a96608c93da6b286ee0d648e639'
print('PASS: raw hashes, exact source/dependencies before and after, native result, daily/decision/transport evidence, old trace timing, committed test byte identity')
