import gzip
import hashlib
import json
from pathlib import Path

repo = Path('/Users/tigercosmos/tenka-fubu')
package = repo / 'docs/validation/2026-10-12/completion-audit/overlay-integrated-51abd75'
package.mkdir(exist_ok=False)
sources = ['tenka-overlay-integrated-51abd75', 'tenka-overlay-integrated-launch-51abd75',
           'tenka-overlay-integrated-inventory-51abd75', 'tenka-overlay-manifest-51abd75',
           'tenka-overlay-keyboard-status-01']
for source in sources:
    for path in (Path('/tmp') / source).rglob('*'):
        if not path.is_file():
            continue
        target = package / 'raw' / source / (str(path.relative_to(Path('/tmp') / source)) + '.gz')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-overlay-integrated-run.py', 'tenka-scoped-source-archive.py',
             'tenka-validation-capture-961f0ae.py', 'tenka-package-overlay-integration.py']:
    (package / name).write_bytes((Path('/tmp') / name).read_bytes())
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Captured immutable51abd75 integrated evidence: {len(manifest)} files')
