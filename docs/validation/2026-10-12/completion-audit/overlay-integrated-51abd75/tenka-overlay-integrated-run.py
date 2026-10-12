import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path('/Users/tigercosmos/tenka-fubu')
manifest = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
out.mkdir(exist_ok=False)

def proof(label):
    rows = []
    for name, expected in manifest['entries'].items():
        path = root / name
        data = path.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        rows.append({'path': name, 'expectedBlob': expected['gitBlob'], 'actualBlob': actual,
                     'sha256': hashlib.sha256(data).hexdigest(),
                     'modeMatches': bool(path.stat().st_mode & 0o111) == (expected['mode'] == '100755')})
    result = {'revision': manifest['revision'], 'passed': all(r['expectedBlob'] == r['actualBlob'] and r['modeMatches'] for r in rows), 'rows': rows}
    with (out / (label + '.json')).open('x') as stream:
        json.dump(result, stream, indent=2)
    assert result['passed'], label

proof('source-before')
focused = ['src/app/hotkeys.spec.ts', 'src/ui/components/Dialog/Dialog.spec.tsx',
           'src/ui/screens/BattleScreen.spec.tsx', 'src/ui/screens/BattlePrompt.spec.tsx',
           'src/ui/screens/EventModal.spec.tsx', 'src/ui/screens/EventWarRoom.spec.tsx',
           'src/ui/screens/MonthSummaryModal.spec.tsx', 'src/ui/screens/MonthSummaryPresentation.spec.tsx',
           'tests/app/AppEndingCampaign.spec.tsx', 'tests/app/eventModalHost.spec.tsx',
           'tests/app/monthSummaryFlow.spec.ts', 'tests/app/monthSummaryRewards.spec.ts',
           'tests/app/proposalDecisionOwnership.spec.tsx', 'tests/app/ProposalPresentation.spec.tsx',
           'tests/app/AppBattleSaveError.spec.tsx', 'tests/app/AppHotkeyFocus.spec.tsx']
commands = [('focused', ['node_modules/.bin/vitest', 'run', *focused]),
            ('typecheck', ['npm', 'run', 'typecheck']),
            ('eslint', ['node_modules/.bin/eslint', '.']),
            ('data', ['npm', 'run', 'validate:data']),
            ('assets', ['npm', 'run', 'validate:assets']),
            ('build', ['npm', 'run', 'build']),
            ('bundle', ['npm', 'run', 'validate:bundle'])]
statuses = []
for label, command in commands:
    start = time.monotonic()
    with (out / (label + '.command.json')).open('x') as stream:
        json.dump({'argv': command, 'cwd': str(root)}, stream, indent=2)
    with (out / (label + '.log')).open('xb', buffering=0) as log:
        os.fsync(log.fileno())
        result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
    row = {'label': label, 'exitCode': result.returncode, 'seconds': time.monotonic() - start}
    statuses.append(row)
    with (out / (label + '.result.json')).open('x') as stream:
        json.dump(row, stream, indent=2)
    print(json.dumps(row), flush=True)
proof('source-after')
with (out / 'status.json').open('x') as stream:
    json.dump(statuses, stream, indent=2)
sys.exit(0 if all(row['exitCode'] == 0 for row in statuses) else 1)
