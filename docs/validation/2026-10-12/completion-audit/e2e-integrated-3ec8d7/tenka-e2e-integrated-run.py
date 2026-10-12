"""Check a frozen E2E-only change while capturing each subprocess before spawn."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path('/Users/tigercosmos/tenka-fubu')
manifest = json.loads(Path(sys.argv[1]).read_text())
output = Path(sys.argv[2])
output.mkdir(exist_ok=False)


def proof(label):
    rows = []
    for name, expected in manifest['entries'].items():
        path = root / name
        data = path.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        rows.append({'path': name, 'expectedBlob': expected['gitBlob'], 'actualBlob': blob,
                     'sha256': hashlib.sha256(data).hexdigest(),
                     'modeMatches': bool(path.stat().st_mode & 0o111) == (expected['mode'] == '100755')})
    result = {'revision': manifest['revision'], 'rows': rows,
              'passed': all(row['expectedBlob'] == row['actualBlob'] and row['modeMatches'] for row in rows)}
    with (output / (label + '.json')).open('x') as stream:
        json.dump(result, stream, indent=2)
    assert result['passed'], label


proof('source-before')
commands = [
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('eslint', ['node_modules/.bin/eslint', '.']),
    ('discovery', ['node_modules/.bin/playwright', 'test', '--list', '--project=chromium']),
    ('format', ['node_modules/.bin/prettier', '--check', 'e2e/earned-regional-ending.spec.ts',
                'e2e/actor-depth-layout.spec.ts']),
]
if len(sys.argv) > 3 and sys.argv[3] == 'coast':
    commands = [
        ('typecheck', ['npm', 'run', 'typecheck']),
        ('eslint', ['node_modules/.bin/eslint', 'e2e/coast-surface-layout.spec.ts']),
        ('discovery', ['node_modules/.bin/playwright', 'test', '--list', '--project=chromium']),
        ('format', ['node_modules/.bin/prettier', '--check', 'e2e/coast-surface-layout.spec.ts']),
    ]
statuses = []
for label, command in commands:
    with (output / (label + '.command.json')).open('x') as stream:
        json.dump({'argv': command, 'cwd': str(root)}, stream, indent=2)
    start = time.monotonic()
    with (output / (label + '.log')).open('xb', buffering=0) as log:
        os.fsync(log.fileno())
        result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
    row = {'label': label, 'exitCode': result.returncode, 'seconds': time.monotonic() - start}
    statuses.append(row)
    with (output / (label + '.result.json')).open('x') as stream:
        json.dump(row, stream, indent=2)
    print(json.dumps(row), flush=True)
proof('source-after')
with (output / 'status.json').open('x') as stream:
    json.dump(statuses, stream, indent=2)
sys.exit(0 if all(row['exitCode'] == 0 for row in statuses) else 1)
