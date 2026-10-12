"""Validate frozen four-step wizard with every subprocess captured before spawn."""
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


overlay_path = root / 'e2e/diplomacy-responsive.spec.ts'
overlay_before = hashlib.sha256(overlay_path.read_bytes()).hexdigest()
with (output / 'responsive-overlay-before.ts').open('xb') as stream:
    stream.write(overlay_path.read_bytes())
with (output / 'overlay-scope.json').open('x') as stream:
    json.dump({'path': str(overlay_path.relative_to(root)), 'sha256': overlay_before,
               'scope': 'Untracked fixed responsive acceptance overlay included in type/lint/discovery; production and all tracked inputs pinned to ab06242.'}, stream, indent=2)
proof('source-before')
commands = [
    ('full', ['npm', 'test']),
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('eslint', ['node_modules/.bin/eslint', '.']),
    ('data', ['npm', 'run', 'validate:data']),
    ('assets', ['npm', 'run', 'validate:assets']),
    ('build', ['npm', 'run', 'build']),
    ('bundle', ['npm', 'run', 'validate:bundle']),
    ('discovery', ['node_modules/.bin/playwright', 'test', '--list', '--project=chromium']),
    ('format', ['node_modules/.bin/prettier', '--check'] + json.loads(Path('/tmp/tenka-wizard-freeze-checks-da142d1/scope.json').read_text()) + ['e2e/diplomacy-responsive.spec.ts']),
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
with (output / 'overlay-after.json').open('x') as stream:
    overlay_after = hashlib.sha256(overlay_path.read_bytes()).hexdigest()
    json.dump({'sha256': overlay_after, 'matchesBefore': overlay_after == overlay_before}, stream, indent=2)
assert overlay_after == overlay_before
with (output / 'status.json').open('x') as stream:
    json.dump(statuses, stream, indent=2)
sys.exit(0 if all(row['exitCode'] == 0 for row in statuses) else 1)
