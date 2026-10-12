"""Check the retained Ending fixture control evidence against its exact bytes."""

import hashlib
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
HASHES = {
    'native-raw.tar.gz': '9b78c47624ab242c1434d6fe76f0ee2b33f8ffb3a06501537345907beb413358',
    'local-raw.tar.gz': '702b65a397bb0092ec5e305cc44046d8cb9f87b955aa974dcd6295bf9e02169b',
}
SOURCE_HASH = 'c2e67596486b4a6af58433c4a7736e1cd18f9e707c078c7595fae49d6a98c160'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


for name, expected in HASHES.items():
    actual = sha((HERE / name).read_bytes())
    assert actual == expected, (name, actual)
assert sha((ROOT / 'e2e/earned-regional-ending.spec.ts').read_bytes()) == SOURCE_HASH


def read(archive: tarfile.TarFile, path: str) -> bytes:
    member = archive.extractfile(path)
    assert member is not None, path
    return member.read()


def outcome(archive: tarfile.TarFile, run: str, expected_exit: int, expected_stats: tuple):
    result = json.loads(read(archive, f'{run}/result.json'))
    report = json.loads(read(archive, f'{run}/report.json'))
    stats = report['stats']
    actual = (stats['expected'], stats['unexpected'], stats['skipped'])
    assert result['exitCode'] == expected_exit, (run, result)
    assert actual == expected_stats, (run, actual)
    return read(archive, f'{run}/stdout-stderr.log').decode()


with tarfile.open(HERE / 'native-raw.tar.gz') as native:
    names = set(native.getnames())
    positive = outcome(native, 'earned-setup-positive-c2', 0, (3, 0, 0))
    assert '3 passed (14.2s)' in positive
    run = 'earned-setup-positive-c2/browser-results/'
    ready = [name for name in names if name.startswith(run) and name.endswith('/provenance.json')]
    assert ready == [run + 'earned-regional-worker-0/provenance.json'], ready
    provenance = json.loads(read(native, ready[0]))
    save = read(native, run + 'earned-regional-worker-0/earned-regional-ending.tfusave')
    assert provenance['saveSha256'] == sha(save)
    assert provenance['saveBytes'] == len(save)
    assert provenance['workerIndex'] == 0
    assert provenance['generatorSourceSha256'] == sha(
        (ROOT / 'tests/app/earnedRegionalEndingJourney.spec.tsx').read_bytes()
    )
    assert b'1 passed' in read(native, run + 'earned-regional-worker-0/earned-regional-route-generation.log')

    failure = outcome(native, 'earned-setup-failure-control-c1', 1, (0, 1, 2))
    assert 'generator exited 1' in failure and '2 did not run' in failure
    prefix = 'earned-setup-failure-control-c1/browser-results/'
    assert not any(name.startswith(prefix) and name.endswith('.tfusave') for name in names)

    restart = outcome(native, 'earned-setup-restart-control-c1', 1, (2, 1, 0))
    assert 'intentional worker restart control' in restart and '2 passed' in restart
    prefix = 'earned-setup-restart-control-c1/browser-results/'
    worker_manifests = sorted(
        name for name in names if name.startswith(prefix) and name.endswith('/provenance.json')
    )
    assert [name.split('/')[-2] for name in worker_manifests] == [
        'earned-regional-worker-0',
        'earned-regional-worker-1',
    ]
    for path in worker_manifests:
        record = json.loads(read(native, path))
        artifact = path.removesuffix('provenance.json') + 'earned-regional-ending.tfusave'
        assert record['saveSha256'] == sha(read(native, artifact))

    outcome(native, 'earned-setup-unrelated-control-c1', 0, (1, 0, 0))
    assert not any(
        'earned-regional-worker-' in name
        for name in names
        if name.startswith('earned-setup-unrelated-control-c1/browser-results/')
    )

    corruption = outcome(native, 'earned-setup-corruption-control-c1', 1, (0, 1, 0))
    assert 'artifact hash changed after generation' in corruption
    hang = outcome(native, 'earned-setup-hang-control-c2', 1, (0, 1, 0))
    assert 'generator exited -1' in hang
    # Retain the two initial RED controls as failures, rather than erasing them.
    outcome(native, 'earned-setup-positive-c1', 1, (0, 0, 0))
    outcome(native, 'earned-setup-hang-control-c1', 1, (0, 1, 0))

with tarfile.open(HERE / 'local-raw.tar.gz') as local:
    source_after = json.loads(
        read(local, 'tenka-ending-source-after-c1/stdout-stderr.log')
    )
    assert source_after['revision'].startswith('ccc31e8')
    assert source_after['extras'] == []
    assert [item['path'] for item in source_after['problems']] == [
        'e2e/earned-regional-ending.spec.ts'
    ]
    assert json.loads(read(local, 'tenka-ending-verify-base-c1/result.json'))['exitCode'] == 0
    assert json.loads(read(local, 'tenka-ending-verify-ccc-c1/result.json'))['exitCode'] == 0
    live = read(local, 'tenka-ending-hang-live-process-c2/stdout-stderr.log').decode()
    post = read(local, 'tenka-ending-hang-postprocess-c2/stdout-stderr.log').decode()
    assert 'HANG_CONTROL_LEADER=3486938 DESCENDANT=3486945' in live
    assert '3486945 3486938 3486938' in live
    # The post-check also prints the historical generator log; only the ps
    # section between its header and that log represents live processes.
    live_process_rows = post.split('    PID    PPID    PGID STAT     ELAPSED COMMAND', 1)[1]
    live_process_rows = live_process_rows.split('HANG_CONTROL_LEADER=', 1)[0]
    assert not live_process_rows.strip(), live_process_rows
    for run in ['tenka-ending-typecheck-c2', 'tenka-ending-build-c1',
                'tenka-ending-local-eslint-c1', 'tenka-ending-final-format-c1',
                'tenka-ending-list-c1']:
        assert json.loads(read(local, run + '/result.json'))['exitCode'] == 0, run

print('PASS: hashes, source/dependency setup, native outcomes, provenance, process cleanup')
