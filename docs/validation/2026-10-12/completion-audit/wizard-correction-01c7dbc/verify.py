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


inventory = json.loads(read('tenka-wizard-final-inventory-c1', 'manifest.json'))
proof = json.loads(read('tenka-wizard-final-inventory-c1', 'source-final.json'))
assert proof['passed'] and len(proof['rows']) == 1641
assert proof['revision'] == inventory['revision'] == '01c7dbc3f45653636e86342fa9e7f8ad5209f89f'
capture = Path(tempfile.mkdtemp(prefix='tenka-wizard-final-git-'))
with (capture/'tree.stdout').open('xb') as stdout, (capture/'tree.stderr').open('xb') as stderr:
    result = subprocess.run(['git', 'ls-tree', '-rz', proof['revision']], cwd=here.parents[4], stdout=stdout, stderr=stderr)
result.check_returncode()
entries = {}
for record in (capture/'tree.stdout').read_bytes().split(b'\0'):
    if record:
        metadata, name = record.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        entries[name.decode()] = {'mode':mode, 'gitBlob':oid}
for row in proof['rows']:
    assert row['expectedBlob'] == row['actualBlob'] == entries[row['path']]['gitBlob']
    assert inventory['entries'][row['path']] == entries[row['path']] and row['modeMatches']
checks = 'tenka-wizard-correction-checks-c1'
before = json.loads(read(checks, 'before.json'))
assert before == json.loads(read(checks, 'after.json')) and len(before) == 4
final_hashes = {row['path']:row['sha256'] for row in proof['rows']}
assert all(final_hashes[name] == value for name, value in before.items())
statuses = json.loads(read(checks, 'status.json'))
assert [row['label'] for row in statuses] == ['focused','typecheck','eslint','data','assets','build','bundle','discovery','format','diffcheck']
assert all(row['exitCode'] == 0 for row in statuses)
assert '32 passed (32)' in read(checks, 'focused.log').decode()
assert 'Total: 425 tests in 105 files' in read(checks, 'discovery.log').decode()
assert set(read('tenka-wizard-correction-commit-c1', 'scope.log').decode().splitlines()) == set(before)
assert read('tenka-wizard-correction-commit-c1', 'head.log').decode().strip() == proof['revision']
assert json.loads(read('tenka-wizard-font-subset-ab06242-c1', 'result.json'))['exitCode'] == 0
with (capture/'font.stdout').open('xb') as stdout, (capture/'font.stderr').open('xb') as stderr:
    result = subprocess.run(['git', 'show', proof['revision']+':public/fonts/noto-serif-tc-subset.manifest.json'], cwd=here.parents[4], stdout=stdout, stderr=stderr)
result.check_returncode(); font = json.loads((capture/'font.stdout').read_bytes())
assert font['charCount'] == 1661 and font['sizeBytes'] == 355728 and font['budgetKb'] == 2048 and '薦' in font['chars']
print('PASS: final01c7dbc Git1641; exact four-file pre/post checks; focused32/types/lint/data/assets/build/bundle/discovery425; font1661/355728.', capture)
