import gzip
import hashlib
import json
from pathlib import Path

root = Path('/Users/tigercosmos/tenka-fubu')
package = root / 'docs/validation/2026-10-12/completion-audit/e2e-integrated-1464146'
package.mkdir(exist_ok=False)
for name in ['tenka-e2e-integrated-1464146', 'tenka-e2e-integrated-launch-1464146',
             'tenka-e2e-integrated-inventory-1464146', 'tenka-e2e-manifest-1464146',
             'tenka-ending-readme-format-01']:
    source = Path('/tmp') / name
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-e2e-integrated-run.py', 'tenka-e2e-package-146.py',
             'tenka-validation-capture-961f0ae.py']:
    with (package / name).open('xb') as stream:
        stream.write((Path('/tmp') / name).read_bytes())
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Retained {len(manifest)} raw and producer files for frozen1464146')
