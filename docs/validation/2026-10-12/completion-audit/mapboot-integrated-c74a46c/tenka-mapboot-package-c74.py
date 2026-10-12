import gzip
import hashlib
import json
from pathlib import Path

root = Path('/Users/tigercosmos/tenka-fubu')
base = root / 'docs/validation/2026-10-12/completion-audit'
package = base / 'mapboot-integrated-c74a46c'
package.mkdir(exist_ok=False)
for name in ['tenka-mapboot-integrated-c74a46c', 'tenka-mapboot-integrated-launch-c74a46c',
             'tenka-mapboot-inventory-launch-c74a46c', 'tenka-mapboot-manifest-c74a46c']:
    source = Path('/tmp') / name
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-mapboot-integrated-run.py', 'tenka-mapboot-package-c74.py',
             'tenka-validation-capture-961f0ae.py']:
    with (package / name).open('xb') as stream:
        stream.write((Path('/tmp') / name).read_bytes())
old = (base / 'e2e-integrated-1464146/verify.py').read_text()
new = old.replace('146414688dc2ceceb81042aeed6984ddf0687926', 'c74a46c83a3db3dea703196781c4c85c9f02bf5c')
new = new.replace('tenka-e2e-integrated-1464146', 'tenka-mapboot-integrated-c74a46c')
new = new.replace('tenka-e2e-manifest-1464146', 'tenka-mapboot-manifest-c74a46c')
new = new.replace('1464146', 'c74a46c').replace('1632', '1633').replace('363', '364')
new = new.replace("assert all(row['exitCode'] == 0 for row in statuses)",
    "assert all(row['exitCode'] == 0 for row in statuses)\n"
    "assert json.loads(read('tenka-mapboot-integrated-c74a46c', 'eslint.command.json'))['argv'] == ['node_modules/.bin/eslint', '.']")
(package / 'verify.py').write_text(new)
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Retained {len(manifest)} raw, producer and verifier files for frozen c74a46c')
