"""Verify frozen local E2E integration evidence and independent Git inventory."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
for name, expected in json.loads((here / 'manifest.json').read_text()).items():
    assert hashlib.sha256((here / name).read_bytes()).hexdigest() == expected, name


def read(run, name):
    return gzip.decompress((here / 'raw' / run / (name + '.gz')).read_bytes())


before = json.loads(read('tenka-wizard-integrated-ab06242-c1', 'source-before.json'))
after = json.loads(read('tenka-wizard-integrated-ab06242-c1', 'source-after.json'))
inventory = json.loads(read('tenka-wizard-ab-inventory-c1', 'manifest.json'))
assert before == after and before['passed']
assert before['revision'] == inventory['revision'] == 'ab06242a542d7dda95ef3f17ec54e81ee1354076'
assert len(before['rows']) == 1640
capture = Path(tempfile.mkdtemp(prefix='tenka-e2e-146-verify-git-'))
command = ['git', 'ls-tree', '-rz', before['revision']]
(capture / 'command.json').write_text(json.dumps(command))
with (capture / 'stdout').open('xb') as stdout, (capture / 'stderr').open('xb') as stderr:
    result = subprocess.run(command, cwd=here.parents[4], stdout=stdout, stderr=stderr)
(capture / 'result.json').write_text(json.dumps({'exitCode': result.returncode}))
result.check_returncode()
entries = {}
for entry in (capture / 'stdout').read_bytes().split(b'\0'):
    if entry:
        metadata, path = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        entries[path.decode()] = {'mode': mode, 'gitBlob': oid}
for row in before['rows']:
    assert row['expectedBlob'] == row['actualBlob'] == inventory['entries'][row['path']]['gitBlob']
    assert inventory['entries'][row['path']] == entries[row['path']]
    assert row['modeMatches']
statuses = json.loads(read('tenka-wizard-integrated-ab06242-c1', 'status.json'))
expected = {'full': 1, 'typecheck': 0, 'eslint': 0, 'data': 1, 'assets': 0, 'build': 0, 'bundle': 0, 'discovery': 0, 'format': 0}
assert {row['label']: row['exitCode'] for row in statuses} == expected
full = read('tenka-wizard-integrated-ab06242-c1', 'full.log').decode()
assert '3 failed | 6451 passed | 1 skipped (6455)' in full
assert '2 failed | 692 passed | 1 skipped (695)' in full
assert full.count(' FAIL |core|') == 3
assert 'tests/data/font-coverage.spec.ts' in full and 'seed=15600519 tick=450 day=450' in full
assert 'Total: 412 tests in 105 files' in read('tenka-wizard-integrated-ab06242-c1', 'discovery.log').decode()
assert '薦(U+85A6)' in read('tenka-wizard-integrated-ab06242-c1', 'data.log').decode()
overlay = read('tenka-wizard-integrated-ab06242-c1', 'responsive-overlay-before.ts')
scope = json.loads(read('tenka-wizard-integrated-ab06242-c1', 'overlay-scope.json'))
post = json.loads(read('tenka-wizard-integrated-ab06242-c1', 'overlay-after.json'))
assert hashlib.sha256(overlay).hexdigest() == scope['sha256'] == post['sha256'] and post['matchesBefore']
for name, count in [('tenka-wizard-migration-final-da142d1-c1', 0), ('tenka-wizard-migration-negative-da142d1-c1', 61), ('tenka-wizard-migration-baseline-da142d1', 61)]:
    assert f'VIOLATIONS: {count}' in read(name, 'stdout-stderr.log').decode()
assert 'CHECKER CONTROLS: PASS' in read('tenka-wizard-migration-final-da142d1-c1', 'stdout-stderr.log').decode()
print('PASS: ab06242 tracked1640 + fixed overlay; full6451/3RED/1skip, scoped checks and 61-to-zero migration controls; Git readback', capture)
