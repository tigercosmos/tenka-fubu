"""Preserve final capture logs and append new evidence without changing old rows."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess

repo = Path('/Users/tigercosmos/tenka-fubu')
base = repo / 'docs/validation/2026-10-12/completion-audit'
package = base / 'overlay-integrated-3da2334'
captures = [
    'tenka-final-docs-prettier-write-01',
    'tenka-final-docs-prettier-check-02',
    'tenka-final-3da-package-capture',
    'tenka-final-3da-verify-01',
    'tenka-five-screen-axe-readback-01',
]
for name in captures:
    source = Path('/tmp') / name
    assert source.is_dir(), source
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output:
                output.write(gzip.compress(path.read_bytes(), mtime=0))
with (package / Path(__file__).name).open('xb') as output:
    output.write(Path(__file__).read_bytes())
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*'))
            if path.is_file() and path != package / 'manifest.json'}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

relative = 'docs/validation/2026-10-12/completion-audit/continuation-artifact-sha256.json'
control = Path('/tmp/tenka-overlay-index-git-control-01')
control.mkdir(exist_ok=False)
command = ['git', 'show', '79682cd:' + relative]
(control / 'command.json').write_text(json.dumps(command) + '\n')
with (control / 'stdout.log').open('xb') as out, (control / 'stderr.log').open('xb') as err:
    result = subprocess.run(command, cwd=repo, stdout=out, stderr=err)
(control / 'result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
assert result.returncode == 0
historical = json.loads((control / 'stdout.log').read_text())
current = json.loads((repo / relative).read_text())
assert current == historical
assert len(current['artifacts']) == 2397
for row in current['artifacts']:
    raw = (base / row['path']).read_bytes()
    assert len(raw) == row['bytes'] and hashlib.sha256(raw).hexdigest() == row['sha256'], row['path']
names = ['battle-controls-79682cd', 'mandatory-overlays-responsive-51abd75',
         'scoped-source-snapshot-79682cd', 'overlay-integrated-51abd75',
         'native-full-suite-8ea965a', 'battle-axe-3da2334', 'overlay-integrated-3da2334']
new = []
for name in names:
    for path in sorted((base / name).rglob('*')):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        row = {'path': str(path.relative_to(base)), 'bytes': len(raw),
               'sha256': hashlib.sha256(raw).hexdigest()}
        if path.suffix == '.gz':
            digest = hashlib.sha256()
            size = 0
            with gzip.open(path, 'rb') as stream:
                while block := stream.read(8 * 1024 * 1024):
                    digest.update(block)
                    size += len(block)
            row.update(uncompressedBytes=size, uncompressedSha256=digest.hexdigest())
        new.append(row)
assert len({row['path'] for row in current['artifacts'] + new}) == 2397 + len(new)
current['artifacts'].extend(new)
(repo / relative).write_text(json.dumps(current, indent=2, ensure_ascii=False) + '\n')
assert current['artifacts'][:2397] == historical['artifacts']
print(json.dumps({'historicalRows': 2397, 'newRows': len(new),
                  'totalRows': len(current['artifacts']),
                  'historicalRowsAndBytesUnchanged': True}))
