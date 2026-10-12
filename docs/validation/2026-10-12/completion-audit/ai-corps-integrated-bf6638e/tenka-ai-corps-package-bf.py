import gzip
import hashlib
import json
from pathlib import Path

root = Path('/Users/tigercosmos/tenka-fubu')
base = root / 'docs/validation/2026-10-12/completion-audit'
package = base / 'ai-corps-integrated-bf6638e'
package.mkdir(exist_ok=False)
for name in ['tenka-ai-corps-integrated-bf6638e-v2', 'tenka-ai-corps-integrated-bf6638e', 'tenka-ai-corps-integrated-launch-bf6638e', 'tenka-ai-corps-integrated-launch-bf6638e-v2',
             'tenka-ai-corps-inventory-launch-bf6638e', 'tenka-ai-corps-manifest-bf6638e']:
    source = Path('/tmp') / name
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))
for name in ['tenka-ai-corps-integrated-run.py', 'tenka-ai-corps-package-bf.py',
             'tenka-validation-capture-961f0ae.py']:
    with (package / name).open('xb') as stream:
        stream.write((Path('/tmp') / name).read_bytes())
old = (base / 'e2e-integrated-1464146/verify.py').read_text()
new = old.replace('146414688dc2ceceb81042aeed6984ddf0687926', 'bf6638e77c3523667c9cbb44e3a82e0197793554')
new = new.replace('tenka-e2e-integrated-1464146', 'tenka-ai-corps-integrated-bf6638e-v2')
new = new.replace('tenka-e2e-manifest-1464146', 'tenka-ai-corps-manifest-bf6638e')
new = new.replace('1464146', 'bf6638e').replace('1632', '1633').replace('363', '364')
new = new.replace("assert all(row['exitCode'] == 0 for row in statuses)",
    "assert all(row['exitCode'] == 0 for row in statuses)\n"
    "assert json.loads(read('tenka-ai-corps-integrated-bf6638e-v2', 'eslint.command.json'))['argv'] == ['node_modules/.bin/eslint', '.']")
(package / 'verify.py').write_text(new)
manifest = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(package.rglob('*')) if path.is_file()}
(package / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Retained {len(manifest)} raw, producer and verifier files for frozen bf6638e')
