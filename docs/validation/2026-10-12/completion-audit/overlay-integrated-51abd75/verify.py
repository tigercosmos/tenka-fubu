from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent


def read(run, name):
    return gzip.decompress((HERE / 'raw' / run / (name + '.gz')).read_bytes())


for name, expected in json.loads((HERE / 'manifest.json').read_text()).items():
    assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == expected, name
before = json.loads(read('tenka-overlay-integrated-51abd75', 'source-before.json'))
after = json.loads(read('tenka-overlay-integrated-51abd75', 'source-after.json'))
assert before == after and before['passed']
assert before['revision'].startswith('51abd75') and len(before['rows']) == 1632
inventory = json.loads(read('tenka-overlay-manifest-51abd75', 'manifest.json'))
assert inventory['revision'] == before['revision']
git_capture = Path(tempfile.mkdtemp(prefix='tenka-overlay-verify-git-'))
command = ['git', 'ls-tree', '-rz', before['revision']]
(git_capture / 'command.json').write_text(json.dumps(command))
with (git_capture / 'stdout').open('xb') as stdout, (git_capture / 'stderr').open('xb') as stderr:
    result = subprocess.run(command, cwd=HERE.parents[4], stdout=stdout, stderr=stderr)
(git_capture / 'result.json').write_text(json.dumps({'exitCode': result.returncode}))
result.check_returncode()
git_entries = {}
for entry in (git_capture / 'stdout').read_bytes().split(b'\0'):
    if entry:
        metadata, path = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        git_entries[path.decode()] = {'mode': mode, 'gitBlob': oid}
for row in before['rows']:
    assert row['expectedBlob'] == row['actualBlob'] == inventory['entries'][row['path']]['gitBlob']
    assert inventory['entries'][row['path']] == git_entries[row['path']]
    assert row['modeMatches']
statuses = json.loads(read('tenka-overlay-integrated-51abd75', 'status.json'))
assert [row['label'] for row in statuses] == ['focused', 'typecheck', 'eslint', 'data', 'assets', 'build', 'bundle']
assert all(row['exitCode'] == 0 for row in statuses)
assert '138 passed' in read('tenka-overlay-integrated-51abd75', 'focused.log').decode()
assert json.loads(read('tenka-overlay-keyboard-status-01', 'result.json'))['exitCode'] == 2
assert 'syntax error' in read('tenka-overlay-keyboard-status-01', 'stdout-stderr.log').decode()
print(f'Frozen51abd75 integration PASS: 1632 Git-verified inputs before/after,138 tests,types/ESLint/data/assets/build/bundle; independent SSH status-read RED retained. Git readback: {git_capture}')
