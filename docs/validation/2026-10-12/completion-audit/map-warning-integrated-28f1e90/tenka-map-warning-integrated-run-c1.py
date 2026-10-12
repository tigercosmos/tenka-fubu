"""Validate frozen territory-preview and uprising-warning source with preopened complete logs."""
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
    targets = json.loads((root / 'tools/dependencies/pixi-8.19-patch.json').read_text())['targets']
    deps = []
    for target in targets:
        path = root / 'node_modules/pixi.js' / target['path']
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        deps.append({'path': target['path'], 'expected': target['patchedSha256'], 'actual': digest})
    with (output / (label + '-pixi.json')).open('x') as stream:
        json.dump(deps, stream, indent=2)
    assert len(deps) == 29 and all(row['expected'] == row['actual'] for row in deps)


proof('source-before')
commands = [
    ('focused', ['node_modules/.bin/vitest', 'run', 'src/ui/map/mapRendererDirty.spec.ts', 'tests/ui/sceneParts/districtNode.spec.ts', 'src/ui/screens/territoryPreviewModel.spec.ts', 'src/ui/screens/DaimyoSelect.spec.tsx', 'src/ui/screens/ScenarioSelect.spec.tsx', 'src/ui/screens/NewGameOptionsScreen.spec.tsx', 'tests/app/App.spec.tsx', 'tests/app/AppBattleSaveError.spec.tsx', 'tests/app/AppEventIntegration.spec.tsx', 'tests/app/AppHotkeyFocus.spec.tsx', 'tests/app/AppSessionRestore.spec.tsx', 'tests/app/productionEventSession.spec.tsx', 'tests/app/quickLoadConsent.spec.tsx']),
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('eslint', ['node_modules/.bin/eslint', '.']),
    ('data', ['npm', 'run', 'validate:data']),
    ('assets', ['npm', 'run', 'validate:assets']),
    ('build', ['npm', 'run', 'build']),
    ('bundle', ['npm', 'run', 'validate:bundle']),
    ('discovery', ['node_modules/.bin/playwright', 'test', '--list', '--project=chromium']),
    ('gallery-discovery', ['node_modules/.bin/playwright', 'test', '--config', 'tests/browser/playwright.gallery.config.ts', '--list']),
    ('format', ['node_modules/.bin/prettier', '--check'] + json.loads(Path(sys.argv[3]).read_text())),
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
