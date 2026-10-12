import gzip
import hashlib
import json
from pathlib import Path

repo = Path('/Users/tigercosmos/tenka-fubu')
package = repo / 'docs/validation/2026-10-12/completion-audit/overlay-integrated-3da2334'
package.mkdir(exist_ok=False)
for source in ['tenka-overlay-integrated-3da2334', 'tenka-overlay-integrated-launch-3da2334',
               'tenka-overlay-integrated-inventory-3da2334', 'tenka-overlay-manifest-3da2334']:
    for path in (Path('/tmp') / source).rglob('*'):
        if path.is_file():
            target = package / 'raw' / source / (str(path.relative_to(Path('/tmp') / source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-overlay-integrated-run.py', 'tenka-scoped-source-archive.py',
             'tenka-validation-capture-961f0ae.py', 'tenka-package-final-3da.py']:
    (package / name).write_bytes((Path('/tmp') / name).read_bytes())
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
old = (repo / 'docs/validation/2026-10-12/completion-audit/overlay-integrated-51abd75/verify.py').read_text()
new = old.replace('51abd75', '3da2334')
new = '\n'.join(line for line in new.split('\n') if 'tenka-overlay-keyboard-status-01' not in line)
new = new.replace('; independent SSH status-read RED retained.', '.')
(package / 'verify.py').write_text(new)
print(f'Final3da2334 integration package: {len(manifest)} retained raw/producer files')
