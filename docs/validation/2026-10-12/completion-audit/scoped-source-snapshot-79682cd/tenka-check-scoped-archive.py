import hashlib
import json
import tarfile
from pathlib import Path

root = Path('/tmp/tenka-scoped-delta-8d0a040')
manifest = json.loads((root / 'manifest.json').read_text())
assert len(manifest['entries']) == 1631
assert manifest['archivePaths'] == ['e2e/battle-controls-acceptance.spec.ts']
assert manifest['deletedPaths'] == []
assert not any(p.startswith(('docs/', 'output/')) for p in manifest['entries'])
with tarfile.open(root / 'source.tar') as archive:
    files = [item for item in archive.getmembers() if item.isfile()]
    assert [item.name for item in files] == manifest['archivePaths']
    for item in files:
        data = archive.extractfile(item).read()
        oid = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        assert oid == manifest['entries'][item.name]['gitBlob']
print('PASS: 1631 allowlisted Git inputs; exact one-file delta; no docs/output; archived Git blob matches manifest.')
