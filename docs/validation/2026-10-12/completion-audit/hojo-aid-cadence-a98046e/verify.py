#!/usr/bin/env python3
"""Verify retained Hojo diagnostic evidence without launching a browser."""
import gzip
import hashlib
import json
import subprocess
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
BASE = 'a98046e8f405e275ddb2796f4ea8c565cf3ba8f2'
base = json.loads((HERE / 'base-manifest.json').read_text())
probe = json.loads((HERE / 'diagnostic-manifest.json').read_text())
assert len(base['entries']) == len(probe['entries']) == 1633
assert {name for name in probe['entries'] if probe['entries'][name] != base['entries'].get(name)} == {'e2e/earned-hojo-aid.spec.ts'}

capture = Path(tempfile.mkdtemp(prefix='tenka-hojo-verify-git-'))
command = ['git', 'ls-tree', '-rz', BASE]
with (capture / 'command.json').open('x') as out:
    json.dump({'argv': command, 'cwd': str(REPO)}, out)
with (capture / 'stdout').open('xb') as stdout, (capture / 'stderr').open('xb') as stderr:
    result = subprocess.run(command, cwd=REPO, stdout=stdout, stderr=stderr)
with (capture / 'result.json').open('x') as out:
    json.dump({'exitCode': result.returncode}, out)
result.check_returncode()
tracked = {}
for row in (capture / 'stdout').read_bytes().split(b'\0'):
    if row:
        meta, name = row.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        tracked[name.decode()] = {'mode': mode, 'gitBlob': oid}
for name, expected in base['entries'].items():
    assert tracked[name] == expected, name
source = gzip.decompress((HERE / 'eligibility-probe.spec.ts.gz').read_bytes())
oid = hashlib.sha1(f'blob {len(source)}\0'.encode() + source).hexdigest()
assert oid == probe['entries']['e2e/earned-hojo-aid.spec.ts']['gitBlob']

def read(run, file):
    with tarfile.open(HERE / 'native-raw.tar.gz', 'r:gz') as archive:
        member = archive.extractfile(f'{run}/{file}')
        assert member is not None, (run, file)
        return member.read()

def outcome(run):
    result = json.loads(read(run, 'result.json'))['exitCode']
    log = read(run, 'stdout-stderr.log').decode()
    return result, log

browser = outcome('tenka-hojo-eligibility-a980-v1')
assert browser[0] == 1 and 'Test timeout of 60000ms exceeded' in browser[1]
assert "getByLabel('援軍對抗勢力', { exact: true })" in browser[1]
before = json.loads(read('tenka-hojo-basebefore-a980-v1', 'fingerprint.json'))
after = json.loads(read('tenka-hojo-sourceafter-a980-v1', 'fingerprint.json'))
assert before['checked'] == after['checked'] == 1633
assert before['mismatches'] == after['mismatches'] == []
assert len(before['pixiFiles']) == len(after['pixiFiles']) == 3695
assert before['pixiFiles'] == after['pixiFiles']
for run in ('tenka-hojo-recompute-day150-v1', 'tenka-hojo-window-recompute-v1', 'tenka-hojo-request-clone-v1'):
    assert outcome(run)[0] == 0, run
fresh = json.loads(outcome('tenka-hojo-recompute-day150-v1')[1].splitlines()[0])
assert fresh['day'] == 150 and fresh['before'] is None and fresh['refreshed'] == 0
window = [json.loads(line) for line in outcome('tenka-hojo-window-recompute-v1')[1].splitlines()]
assert len(window) == 31 and window[0]['day'] == 120 and window[-1]['day'] == 150
assert window[1]['day'] == 121 and window[1]['score'] >= 0.5 and window[1]['priorThreat'] > window[1]['freshThreat']
clone = [json.loads(line) for line in outcome('tenka-hojo-request-clone-v1')[1].splitlines()]
assert [row['before']['day'] for row in clone] == [120, 121, 122, 125, 126, 150]
assert all(row['legality']['ok'] and row['applied'] == 1 and any(e['type'] == 'diplo.refused' for e in row['events']) for row in clone)
listed = {}
for line in (HERE / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    listed[name] = digest
assert set(listed) == {path.name for path in HERE.iterdir() if path.is_file() and path.name != 'SHA256SUMS'}
for name, digest in listed.items():
    h = hashlib.sha256()
    with (HERE / name).open('rb') as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b''):
            h.update(chunk)
    assert h.hexdigest() == digest, name
print('Hojo diagnosis PASS: original failure, diagnostic timeout, cache-cadence refusal, source and dependency pins')
