import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
rows = []
for path in sorted(root.rglob('*')):
    if not path.is_file():
        continue
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    rows.append({
        'path': str(path.relative_to(root)),
        'sizeBytes': path.stat().st_size,
        'sha256': digest.hexdigest(),
    })
out = pathlib.Path(sys.argv[2])
with out.open('x') as stream:
    json.dump({
        'root': str(root),
        'totalFiles': len(rows),
        'totalBytes': sum(row['sizeBytes'] for row in rows),
        'files': rows,
    }, stream, indent=2)
    stream.write('\n')
print(json.dumps({'totalFiles': len(rows), 'totalBytes': sum(row['sizeBytes'] for row in rows)}))
