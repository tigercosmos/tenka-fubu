"""Find old direct final-start selectors outside the audited four-step wizard paths."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--root', default='/Users/tigercosmos/tenka-fubu')
parser.add_argument('--revision')
parser.add_argument('--self-test', action='store_true')
parser.add_argument('--inventory', action='store_true')
args = parser.parse_args()
root = Path(args.root)
pattern = re.compile(r'''getByTestId\s*\(\s*['"]newgame-start['"]\s*\)''')
exempt = {'e2e/new-game-wizard.ts', 'e2e/new-game-wizard.spec.ts'}

def scan(name, source):
    if name in exempt:
        return []
    return [(name, source.count('\n', 0, match.start()) + 1) for match in pattern.finditer(source)]

if args.self_test:
    assert scan('e2e/example.spec.ts', "await page.getByTestId('newgame-start').click();") == [('e2e/example.spec.ts', 1)]
    assert scan('e2e/example.spec.ts', 'await completeNewGameWizard(page);') == []
    assert scan('e2e/example.spec.ts', 'await page.getByTestId(\n"newgame-start"\n).click();') == [('e2e/example.spec.ts', 1)]
    assert scan('e2e/new-game-wizard.ts', "await page.getByTestId('newgame-start').click();") == []
    print('CHECKER CONTROLS: PASS (old, migrated, multiline, explicit helper exemption)')

sources = {}
if args.revision:
    capture = Path(tempfile.mkdtemp(prefix='tenka-wizard-check-git-'))
    commands = []
    def git(command):
        index = len(commands)
        argv = ['git', *command]
        commands.append(argv)
        (capture / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
        with (capture / f'{index}.stdout').open('xb') as out, (capture / f'{index}.stderr').open('xb') as err:
            result = subprocess.run(argv, cwd=root, stdout=out, stderr=err)
        (capture / f'{index}.result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
        result.check_returncode()
        return (capture / f'{index}.stdout').read_text()
    paths = git(['ls-tree', '-r', '--name-only', args.revision, '--', 'e2e']).splitlines()
    for name in paths:
        if name.endswith('.ts'):
            sources[name] = git(['show', args.revision + ':' + name])
    print('GIT READBACK CAPTURE: ' + str(capture))
else:
    for path in sorted((root / 'e2e').rglob('*.ts')):
        sources[str(path.relative_to(root))] = path.read_text()

hits = [hit for name, source in sorted(sources.items()) for hit in scan(name, source)]
for name, line in hits:
    print(f'{name}:{line} -- direct final-start lookup outside audited four-step wizard')
print('SCOPE: all e2e/**/*.ts; excludes source/unit, docs, generated, dependencies')
print('AUDITED EXEMPTIONS: e2e/new-game-wizard.ts; e2e/new-game-wizard.spec.ts')
print(f'FILES: {len({name for name, _ in hits})}')
print(f'VIOLATIONS: {len(hits)}')

if args.inventory:
    broad = re.compile(r'newgame[-_]start|ui\.newGame\.start|開始遊戲|clan-pick-|screen-daimyo-select|daimyo-next|difficulty-next')
    rows = []
    for directory in ['e2e', 'tests', 'tools', 'src']:
        for path in sorted((root / directory).rglob('*')):
            if path.suffix not in {'.ts', '.tsx', '.js', '.mjs'} or not path.is_file():
                continue
            for line, text in enumerate(path.read_text().splitlines(), 1):
                if broad.search(text):
                    rows.append({'path': str(path.relative_to(root)), 'line': line, 'text': text.strip()})
    print('BROAD DISCOVERY: literal start labels, test IDs, prior clan entry and new step controls across e2e/tests/tools/src; excludes docs, generated build outputs, dependencies and data JSON. This inventories matching source, not arbitrary dynamically constructed selectors.')
    print(json.dumps(rows, indent=2, ensure_ascii=False))
    print(f'BROAD MATCHES: {len(rows)}')
