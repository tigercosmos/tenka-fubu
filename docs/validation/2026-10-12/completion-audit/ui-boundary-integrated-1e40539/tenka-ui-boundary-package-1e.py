import gzip
import hashlib
import json
from pathlib import Path

root = Path('/Users/tigercosmos/tenka-fubu')
base = root / 'docs/validation/2026-10-12/completion-audit'
package = base / 'ui-boundary-integrated-1e40539'
package.mkdir(exist_ok=False)
for name in ['tenka-ui-boundary-integrated-1e40539', 'tenka-ui-boundary-integrated-launch-1e40539',
             'tenka-ui-boundary-inventory-launch-1e40539', 'tenka-ui-boundary-manifest-1e40539']:
    source = Path('/tmp') / name
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-ui-boundary-integrated-run.py', 'tenka-ui-boundary-package-1e.py',
             'tenka-validation-capture-961f0ae.py']:
    with (package / name).open('xb') as stream:
        stream.write((Path('/tmp') / name).read_bytes())
old = (base / 'e2e-integrated-1464146/verify.py').read_text()
new = old.replace('146414688dc2ceceb81042aeed6984ddf0687926', '1e405399a2f750bbc7fc9db6e9a440372732ced1')
new = new.replace('tenka-e2e-integrated-1464146', 'tenka-ui-boundary-integrated-1e40539')
new = new.replace('tenka-e2e-manifest-1464146', 'tenka-ui-boundary-manifest-1e40539')
new = new.replace('1464146', '1e40539').replace('1632', '1633').replace('363', '364')
new = new.replace("assert all(row['exitCode'] == 0 for row in statuses)",
    "assert all(row['exitCode'] == 0 for row in statuses)\n"
    "assert json.loads(read('tenka-ui-boundary-integrated-1e40539', 'eslint.command.json'))['argv'] == ['node_modules/.bin/eslint', '.']")
(package / 'verify.py').write_text(new)
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Retained {len(manifest)} raw, producer and verifier files for frozen 1e40539')
