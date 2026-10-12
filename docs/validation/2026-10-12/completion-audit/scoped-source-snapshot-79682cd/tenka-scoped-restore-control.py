import hashlib
import json
import tarfile
from pathlib import Path

full = Path('/tmp/tenka-scoped-full-796')
delta = Path('/tmp/tenka-scoped-delta-8d0a040')
destination = Path('/tmp/tenka-scoped-restore-8d0a040')
destination.mkdir(exist_ok=False)

def restore(package):
    manifest = json.loads((package / 'manifest.json').read_text())
    for name in manifest['deletedPaths']:
        (destination / name).unlink()
    with tarfile.open(package / 'source.tar') as archive:
        for member in archive.getmembers():
            assert not member.name.startswith('/') and '..' not in Path(member.name).parts
        archive.extractall(destination, filter='data')
    for name, expected in manifest['entries'].items():
        path = destination / name
        assert path.is_file() and not path.is_symlink(), name
        data = path.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        assert actual == expected['gitBlob'], name
        assert bool(path.stat().st_mode & 0o111) == (expected['mode'] == '100755'), name
    actual_files = {str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file()}
    assert actual_files == set(manifest['entries'])
    return len(actual_files)

base_count = restore(full)
final_count = restore(delta)
assert not (destination / 'docs').exists()
assert not (destination / 'output').exists()
print(f'PASS: restored exact base {base_count} files, applied one-file delta, verified all {final_count} final Git blobs and executable modes; no docs/output.')
