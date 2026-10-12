#!/usr/bin/env python3
"""Verify AI corps jump completion evidence without launching a browser."""
import hashlib
import json
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
BASE = 'c74a46c83a3db3dea703196781c4c85c9f02bf5c'
FINAL = 'bf6638e77c3523667c9cbb44e3a82e0197793554'
base = json.loads((HERE / 'base-manifest.json').read_text())
final = json.loads((HERE / 'candidate-manifest.json').read_text())
assert len(base['entries']) == len(final['entries']) == 1633
assert {name for name in final['entries'] if final['entries'][name] != base['entries'].get(name)} == {'e2e/ai-corps.spec.ts'}

def git_tree(revision):
    capture = Path(tempfile.mkdtemp(prefix='tenka-ai-corps-verify-git-'))
    command = ['git', 'ls-tree', '-rz', revision]
    with (capture / 'command.json').open('x') as target:
        json.dump({'argv': command, 'cwd': str(REPO)}, target)
    with (capture / 'stdout').open('xb') as stdout, (capture / 'stderr').open('xb') as stderr:
        result = subprocess.run(command, cwd=REPO, stdout=stdout, stderr=stderr)
    with (capture / 'result.json').open('x') as target:
        json.dump({'exitCode': result.returncode}, target)
    result.check_returncode()
    entries = {}
    for row in (capture / 'stdout').read_bytes().split(b'\0'):
        if row:
            meta, name = row.split(b'\t', 1)
            mode, kind, oid = meta.decode().split()
            entries[name.decode()] = {'mode': mode, 'gitBlob': oid}
    return entries

for revision, manifest in ((BASE, base), (FINAL, final)):
    tracked = git_tree(revision)
    for name, expected in manifest['entries'].items():
        assert tracked[name] == expected, (revision, name)

def read(archive, run, file):
    with tarfile.open(HERE / archive, 'r:gz') as raw:
        member = raw.extractfile(f'{run}/{file}')
        assert member is not None
        return member.read()

def outcome(archive, run):
    code = json.loads(read(archive, run, 'result.json'))['exitCode']
    log = read(archive, run, 'stdout-stderr.log').decode()
    return code, log

old = outcome('native-raw.tar.gz', 'tenka-ai-corps-exact-old-two-v1')
observed = outcome('native-raw.tar.gz', 'tenka-ai-corps-observe-old-two-v1')
candidate = outcome('native-raw.tar.gz', 'tenka-ai-corps-candidate-two-v1')
assert old[0] == observed[0] == 1 and '2 failed' in old[1] and '2 failed' in observed[1]
assert candidate[0] == 0 and '2 passed' in candidate[1]
observation = json.loads((HERE / 'observations.json').read_text())
assert observation['after-create-step-return']['corps'] == []
assert observation['after-create-step-return']['simulation']['pendingTicks'] == 1
assert observation['after-month-jump-return']['dayOfMonth'] == 4
assert observation['after-month-jump-return']['corps'][0]['gold'] == 0
assert observation['after-month-jump-return']['simulation']['pendingTicks'] == 1
before = json.loads(read('proof-raw.tar.gz', 'tenka-ai-corps-sourcebefore-v1', 'fingerprint.json'))
after = json.loads(read('proof-raw.tar.gz', 'tenka-ai-corps-sourceafter-v1', 'fingerprint.json'))
assert before == after and before['checked'] == 1633 and before['mismatches'] == []
assert len(before['pixiFiles']) == 3695
assert outcome('proof-raw.tar.gz', 'tenka-ai-corps-sourcecompare-v1')[0] == 0
for name in ('tenka-ai-corps-candidate-type-v1', 'tenka-ai-corps-candidate-eslint-v1',
             'tenka-ai-corps-candidate-prettier-v1', 'tenka-ai-corps-diffcheck-v1'):
    assert outcome('local-raw.tar.gz', name)[0] == 0, name
listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    listed[name] = digest
assert set(listed) == {path.name for path in HERE.iterdir() if path.is_file() and path.name != 'SHA256SUMS'}
for name, digest in listed.items():
    assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == digest, name
print('AI corps evidence PASS: exact old 2 RED; Worker pending; candidate 2 GREEN; 1633 source and 3695 Pixi files')
