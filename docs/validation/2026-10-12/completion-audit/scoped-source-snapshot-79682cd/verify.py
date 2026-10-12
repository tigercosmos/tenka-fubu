from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

HERE = Path(__file__).resolve().parent


def read(run, name):
    return gzip.decompress((HERE / 'raw' / run / (name + '.gz')).read_bytes())


for name, expected in json.loads((HERE / 'artifact-sha256.json').read_text()).items():
    assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == expected, name
base = json.loads(read('tenka-scoped-full-796', 'manifest.json'))
delta = json.loads(read('tenka-scoped-delta-8d0a040', 'manifest.json'))
assert len(base['entries']) == 1630
assert len(delta['entries']) == 1631
assert delta['base'] == base['revision']
assert delta['archivePaths'] == ['e2e/battle-controls-acceptance.spec.ts']
assert delta['deletedPaths'] == []
assert not any(p.startswith(('docs/', 'output/')) for p in delta['entries'])
raw_tar = read('tenka-scoped-delta-8d0a040', 'source.tar')
assert hashlib.sha256(raw_tar).hexdigest() == delta['archiveSha256']
with tarfile.open(fileobj=io.BytesIO(raw_tar)) as archive:
    files = [item for item in archive.getmembers() if item.isfile()]
    assert [item.name for item in files] == delta['archivePaths']
    data = archive.extractfile(files[0]).read()
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == delta['entries'][files[0].name]['gitBlob']
for run in ['tenka-scoped-archive-control-796', 'tenka-scoped-archive-verify-8d', 'tenka-scoped-full-control-796', 'tenka-scoped-restore-proof-8d']:
    assert json.loads(read(run, 'result.json'))['exitCode'] == 0
assert 'verified all 1631 final Git blobs and executable modes' in read('tenka-scoped-restore-proof-8d', 'stdout-stderr.log').decode()
print('Scoped snapshot evidence PASS: exact full base and one-file delta restore, all final blob/mode checks, logs and hashes retained.')
