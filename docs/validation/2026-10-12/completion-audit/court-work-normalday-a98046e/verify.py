#!/usr/bin/env python3
"""Verify the bounded court-work native reproduction and committed test fix."""
import hashlib
import json
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
BASE = '1649c6516e7cb2cbaf0f9bdf08859b510e8b922b'
FINAL = 'a98046e8f405e275ddb2796f4ea8c565cf3ba8f2'
base = json.loads((HERE / 'base-manifest.json').read_text())
final = json.loads((HERE / 'candidate-manifest.json').read_text())
assert len(base['entries']) == len(final['entries']) == 1633
assert {name for name in final['entries'] if final['entries'][name] != base['entries'].get(name)} == {'e2e/court-work.spec.ts'}

def git_tree(revision):
    capture = Path(tempfile.mkdtemp(prefix='tenka-court-verify-git-'))
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

launch = outcome('native-raw.tar.gz', 'tenka-court-original-1649-v1')
cache = outcome('native-raw.tar.gz', 'tenka-court-original-1649-v2')
old = outcome('native-raw.tar.gz', 'tenka-court-original-1649-v3')
observed = outcome('native-raw.tar.gz', 'tenka-court-observe-1649-v1')
candidate = outcome('native-raw.tar.gz', 'tenka-court-candidate-1649-v1')
assert launch[0] == 127 and 'node' in launch[1]
assert cache[0] == 1 and 'Executable doesn\'t exist' in cache[1]
assert old[0] == 1 and 'Expected: 30' in old[1] and 'Received: 29' in old[1]
assert observed[0] == 1 and 'COURT_WORK_BOUNDARY_OBSERVATION' in observed[1]
assert '"before":29,"after":29' in observed[1]
assert '"day":30' in observed[1] and '"pendingTicks":0' in observed[1]
assert candidate[0] == 0 and '1 passed' in candidate[1]
assert outcome('native-raw.tar.gz', 'tenka-court-sourcebefore-1649-v1')[0] == 0
assert outcome('native-raw.tar.gz', 'tenka-court-sourceafter-1649-v1')[0] == 0
before = json.loads(read('native-raw.tar.gz', 'tenka-court-sourcebefore-1649-v1', 'fingerprint.json'))
after = json.loads(read('native-raw.tar.gz', 'tenka-court-sourceafter-1649-v1', 'fingerprint.json'))
assert before['checked'] == after['checked'] == 1633
assert before['mismatches'] == after['mismatches'] == []
assert len(before['pixiFiles']) == len(after['pixiFiles']) == 3695
assert before['pixiFiles'] == after['pixiFiles']
for name in ('tenka-court-candidate-type-v1', 'tenka-court-candidate-eslint-v1',
             'tenka-court-candidate-prettier-v1', 'tenka-court-candidate-diffcheck-v1'):
    assert outcome('local-raw.tar.gz', name)[0] == 0, name
listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    listed[name] = digest
assert set(listed) == {path.name for path in HERE.iterdir() if path.is_file() and path.name != 'SHA256SUMS'}
for name, digest in listed.items():
    h = hashlib.sha256()
    with (HERE / name).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    assert h.hexdigest() == digest, name
print('Court-work evidence PASS: exact old RED, commit-after-read observed, candidate GREEN, source pins and 3695 Pixi files')
