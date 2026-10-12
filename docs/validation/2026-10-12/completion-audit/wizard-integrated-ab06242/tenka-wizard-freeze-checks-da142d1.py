from pathlib import Path
import json
import subprocess

repo = Path('/Users/tigercosmos/tenka-fubu')
out = Path('/tmp/tenka-wizard-freeze-checks-da142d1')
out.mkdir(exist_ok=False)
def run(label, command):
    (out / f'{label}.command.json').write_text(json.dumps(command) + '\n')
    with (out / f'{label}.stdout').open('xb') as stdout, (out / f'{label}.stderr').open('xb') as stderr:
        result = subprocess.run(command, cwd=repo, stdout=stdout, stderr=stderr)
    (out / f'{label}.result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
    print(json.dumps({'label': label, 'exitCode': result.returncode}), flush=True)
    result.check_returncode()

run('changed-paths', ['git', 'diff', '--name-only'])
paths = (out / 'changed-paths.stdout').read_text().splitlines()
assert all(path.startswith(('e2e/', 'src/', 'tests/')) or path == 'plan/11-ui-screens.md' for path in paths)
paths += ['e2e/new-game-wizard.ts', 'e2e/new-game-wizard.spec.ts',
          'src/ui/screens/NewGameOptionsScreen.tsx', 'src/ui/screens/NewGameOptionsScreen.module.css',
          'src/ui/screens/NewGameOptionsScreen.spec.tsx',
          'src/ui/screens/WizardProgress.tsx', 'src/ui/screens/WizardProgress.module.css']
assert 'e2e/diplomacy-responsive.spec.ts' not in paths
(out / 'scope.json').write_text(json.dumps(paths, indent=2) + '\n')
run('format', ['node', 'node_modules/prettier/bin/prettier.cjs', '--write', *paths])
run('eslint', ['node', 'node_modules/eslint/bin/eslint.js', *[path for path in paths if path.endswith(('.ts', '.tsx'))]])
run('diff-check', ['git', 'diff', '--check'])
