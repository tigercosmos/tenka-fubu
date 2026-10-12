"""Package the four retained sim4 alliance runs without changing raw files."""

import gzip
import hashlib
import json
import shutil
import tarfile
from pathlib import Path


ROOT = Path('/tmp/tenka-battle-79682cd/runs')
RUNS = (
    'alliance-original-1649-c1',
    'alliance-diagnostic-1649-c1',
    'alliance-candidate-1649-c1',
    'alliance-final-1649-c2',
)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


for name in RUNS:
    run = ROOT / name
    files = {}
    for basename in ('report.json', 'stdout-stderr.log'):
        source = run / basename
        packed = run / (basename + '.gz')
        with source.open('rb') as input_stream, gzip.open(packed, 'xb') as output_stream:
            shutil.copyfileobj(input_stream, output_stream)
        files[basename] = {
            'rawBytes': source.stat().st_size,
            'rawSha256': digest(source),
            'gzipBytes': packed.stat().st_size,
            'gzipSha256': digest(packed),
        }
    with tarfile.open(run / 'metadata.tar.gz', 'x:gz') as archive:
        for basename in ('command.json', 'process.json', 'result.json'):
            archive.add(run / basename, arcname=basename)
    browser_root = run / 'browser-results'
    browser_files = []
    for path in sorted(browser_root.rglob('*')):
        if path.is_file():
            browser_files.append({
                'path': str(path.relative_to(browser_root)),
                'sizeBytes': path.stat().st_size,
                'sha256': digest(path),
            })
    with (run / 'browser-inventory.json').open('x') as stream:
        json.dump({
            'root': str(browser_root),
            'totalFiles': len(browser_files),
            'totalBytes': sum(row['sizeBytes'] for row in browser_files),
            'files': browser_files,
        }, stream, indent=2)
        stream.write('\n')
    with (run / 'package-inventory.json').open('x') as stream:
        json.dump({
            'run': name,
            'files': files,
            'metadataSha256': digest(run / 'metadata.tar.gz'),
            'browserInventorySha256': digest(run / 'browser-inventory.json'),
        }, stream, indent=2)
        stream.write('\n')
    print(json.dumps({
        'run': name,
        'browserFiles': len(browser_files),
        'browserBytes': sum(row['sizeBytes'] for row in browser_files),
        'reportGzipBytes': files['report.json']['gzipBytes'],
    }))
