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


before = json.loads(read('tenka-ai-corps-integrated-bf6638e-v2', 'source-before.json'))
failed_before = json.loads(read('tenka-ai-corps-integrated-bf6638e', 'source-before.json'))
assert not failed_before['passed']
assert [row['path'] for row in failed_before['rows']
        if row['expectedBlob'] != row['actualBlob'] or not row['modeMatches']] == ['CLAUDE.md']
after = json.loads(read('tenka-ai-corps-integrated-bf6638e-v2', 'source-after.json'))
inventory = json.loads(read('tenka-ai-corps-manifest-bf6638e', 'manifest.json'))
assert before == after and before['passed']
assert before['revision'] == inventory['revision'] == 'bf6638e77c3523667c9cbb44e3a82e0197793554'
assert len(before['rows']) == 1633
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
statuses = json.loads(read('tenka-ai-corps-integrated-bf6638e-v2', 'status.json'))
assert [row['label'] for row in statuses] == ['typecheck', 'eslint', 'discovery', 'format']
assert all(row['exitCode'] == 0 for row in statuses)
assert json.loads(read('tenka-ai-corps-integrated-bf6638e-v2', 'eslint.command.json'))['argv'] == ['node_modules/.bin/eslint', '.']
assert 'Total: 364 tests in 103 files' in read('tenka-ai-corps-integrated-bf6638e-v2', 'discovery.log').decode()
print(f'PASS: frozenbf6638e; 1633 Git-verified inputs before/after; types/full ESLint/364-case discovery/format. Git readback {capture}')
