from pathlib import Path
import json
import subprocess

repo = Path('/Users/tigercosmos/tenka-fubu')
out = Path('/tmp/tenka-wizard-commit-da142d1')
out.mkdir(exist_ok=False)
def run(label, command):
    (out / f'{label}.command.json').write_text(json.dumps(command, ensure_ascii=False) + '\n')
    with (out / f'{label}.stdout').open('xb') as stdout, (out / f'{label}.stderr').open('xb') as stderr:
        result = subprocess.run(command, cwd=repo, stdout=stdout, stderr=stderr)
    (out / f'{label}.result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
    print(json.dumps({'label': label, 'exitCode': result.returncode}), flush=True)
    result.check_returncode()

paths = json.loads(Path('/tmp/tenka-wizard-freeze-checks-da142d1/scope.json').read_text())
run('checker', ['python3', '/tmp/tenka-wizard-migration-check-da142d1.py', '--self-test'])
assert (out / 'checker.stdout').read_text().endswith('VIOLATIONS: 0\n')
run('stage', ['git', 'add', '--', *paths])
run('scope', ['git', 'diff', '--cached', '--name-only'])
assert set((out / 'scope.stdout').read_text().splitlines()) == set(paths)
run('staged-check', ['git', 'diff', '--cached', '--check'])
run('commit', ['git', 'commit', '-m', 'feat(ui): 完成難易度與種子四步驟開局 [M8-17]'])
run('head', ['git', 'rev-parse', 'HEAD'])
print((out / 'head.stdout').read_text().strip())
