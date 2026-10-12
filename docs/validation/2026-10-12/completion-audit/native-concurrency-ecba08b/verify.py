"""Verify retained frozen-source four/eight-worker diagnostics from raw bytes."""

import contextlib
import gzip
import hashlib
import io
import json
import runpy
import sys
import tarfile
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REVISION = 'ecba08b76b772a598a6e6ceb61615b648c765170'
EXPECTED = {
    'w4': {'passed': 162, 'failed': 9, 'otherSkipped': 20,
           'terminalInterrupted': 2, 'notDispatched': 171},
    'w8': {'passed': 218, 'failed': 9, 'timedOut': 1, 'otherSkipped': 23,
           'terminalInterrupted': 3, 'notDispatched': 110},
}
RAW_REPORT_SHA256 = {
    'w4': '6595cdac80d5b207e6da41888d547d47de2e21d97f0a17ad53b8f4c10e8a815d',
    'w8': 'a21186b888ba59c71c0d28b76ce30e71ee5fbc68746e7002bc43eb466112c66c',
}
EXPECTED_OUTPUT = {
    'w4': (10021, 3023689751),
    'w8': (25733, 5159178578),
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read_capture(name):
    capture = ROOT / 'captures' / name
    assert json.loads((capture / 'result.json').read_text())['exitCode'] == 0, name
    with gzip.open(capture / 'stdout-stderr.log.gz', 'rt') as stream:
        return stream.read()


def run_script(script, args):
    old_argv = sys.argv
    try:
        sys.argv = [str(ROOT / script), *[str(arg) for arg in args]]
        with contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(ROOT / script), run_name='__main__')
    finally:
        sys.argv = old_argv


manifest = json.loads((ROOT / 'artifact-sha256.json').read_text())
listed = {row['path']: row for row in manifest['files']}
actual = {
    str(path.relative_to(ROOT)): path for path in ROOT.rglob('*')
    if path.is_file() and path.name != 'artifact-sha256.json'
}
assert listed.keys() == actual.keys(), (sorted(listed.keys() - actual.keys()), sorted(actual.keys() - listed.keys()))
for name, path in actual.items():
    assert path.stat().st_size == listed[name]['sizeBytes'], name
    assert sha256(path) == listed[name]['sha256'], name

delta = json.loads((ROOT / 'captures' / 'tenka-concurrency-delta-ecba-c1' / 'manifest.json').read_text())
assert delta['revision'] == REVISION
for label in ('source-before4', 'source-after4', 'source-after8'):
    evidence = json.loads(read_capture(f'tenka-concurrency-{label}-ecba-c1'))
    assert evidence == {'revision': REVISION, 'checked': 1632, 'problems': [], 'extras': []}
dependency_proofs = [
    read_capture(f'tenka-concurrency-{label}-ecba-c1') for label in
    ('deps-before4', 'deps-after4', 'deps-after8')
]
assert dependency_proofs[0] == dependency_proofs[1] == dependency_proofs[2]
assert json.loads((ROOT / 'captures' / 'tenka-concurrency-build-launch-ecba-c1' / 'result.json').read_text())['exitCode'] == 0

for workers in (4, 8):
    label = f'w{workers}'
    outer = ROOT / 'captures' / f'tenka-concurrency-{label}-launch-ecba-c1'
    assert json.loads((outer / 'result.json').read_text())['exitCode'] == 1
    command = json.loads((outer / 'command.json').read_text())['argv']
    serialized = ' '.join(command)
    assert f'--workers={workers}' in serialized and '--reporter=line,json' in serialized
    assert 'CI=1 VISUAL_GPU=1' in serialized
    assert '--timeout' not in serialized and '--global-timeout' not in serialized
    with tarfile.open(ROOT / f'{label}-metadata.tar.gz', 'r:gz') as archive:
        remote_result = json.load(archive.extractfile('result.json'))
        remote_command = json.load(archive.extractfile('command.json'))
    assert remote_result['exitCode'] == 1
    assert f'--workers={workers}' in ' '.join(remote_command['argv'])
    with gzip.open(ROOT / f'{label}-report.json.gz', 'rb') as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    assert digest.hexdigest() == RAW_REPORT_SHA256[label]
    inventory = json.loads((ROOT / f'{label}-browser-inventory.json').read_text())
    assert (inventory['totalFiles'], inventory['totalBytes']) == EXPECTED_OUTPUT[label]
    assert len(inventory['files']) == inventory['totalFiles']
    assert sum(row['sizeBytes'] for row in inventory['files']) == inventory['totalBytes']
    provenance = json.loads((ROOT / f'{label}-generator' / 'provenance.json').read_text())
    save = ROOT / f'{label}-generator' / 'earned-regional-ending.tfusave'
    assert save.stat().st_size == provenance['saveBytes'] == 155056
    assert sha256(save) == provenance['saveSha256']
    assert provenance['generatorSourceSha256'] == '9b959d1e3112fe4a9feadd3df2184a534d7b860f8914cefceb790e75739444f4'
    with gzip.open(ROOT / f'{label}-generator' / 'earned-regional-route-generation.log.gz', 'rt') as stream:
        log = stream.read()
    assert '1 passed' in log and '1 skipped' in log
    generator_entry = f'earned-regional-worker-{provenance["workerIndex"]}/earned-regional-ending.tfusave'
    inventory_rows = [row for row in inventory['files'] if row['path'] == generator_entry]
    assert len(inventory_rows) == 1 and inventory_rows[0]['sha256'] == sha256(save)

with tempfile.TemporaryDirectory() as temporary:
    temporary = Path(temporary)
    parsed = {}
    for label in ('w4', 'w8'):
        output = temporary / f'{label}-analysis.json'
        run_script('analyze-reports.py', [
            ROOT / f'{label}-report.json.gz',
            ROOT / f'{label}-stdout-stderr.log.gz', output,
        ])
        parsed[label] = json.loads(output.read_text())
        assert parsed[label] == json.loads((ROOT / f'{label}-analysis.json').read_text())
        assert parsed[label]['discovered'] == 364
        assert parsed[label]['categories'] == EXPECTED[label]
        assert 300000 <= parsed[label]['stats']['duration'] < 300001
    transitions = temporary / 'transitions.json'
    run_script('compare-runs.py', [temporary / 'w4-analysis.json', temporary / 'w8-analysis.json', transitions])
    assert json.loads(transitions.read_text()) == json.loads((ROOT / 'transition-map.json').read_text())
    assert len(json.loads(transitions.read_text())['rows']) == 364

print('PASS: exact source/dependencies, complete raw 364-case reports, title transitions, generator provenance, inventories, and artifact hashes')
