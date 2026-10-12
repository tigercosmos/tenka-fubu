#!/usr/bin/env python3
"""Capture an allowlisted immutable Git runtime snapshot or delta, never evidence."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--repo', required=True)
p.add_argument('--revision', required=True)
p.add_argument('--base')
p.add_argument('--output', required=True)
p.add_argument('--inventory-only', action='store_true')
a = p.parse_args()
out = Path(a.output).resolve()
out.mkdir(parents=True, exist_ok=False)
roots = {'src', 'e2e', 'tests', 'tools', 'public', 'assets', 'rust', 'plan', '.github'}
files = {'.gitignore', '.prettierignore', '.prettierrc.json', 'CLAUDE.md',
         'package.json', 'package-lock.json', 'index.html', 'milestone.json',
         'eslint.config.js', 'tsconfig.json', 'tsconfig.core.json',
         'vite.config.ts', 'vitest.workspace.ts', 'playwright.config.ts',
         'playwright.cold-load.config.ts', 'playwright.soak.config.ts'}

def run(label, cmd, binary=False):
    with (out / (label + '.command.json')).open('x') as f:
        json.dump({'argv': cmd, 'cwd': a.repo}, f, indent=2)
    target = out / ('source.tar' if binary else label + '.stdout')
    with target.open('xb') as stdout, (out / (label + '.stderr')).open('xb') as stderr:
        result = subprocess.run(cmd, cwd=a.repo, stdout=stdout, stderr=stderr)
    with (out / (label + '.result.json')).open('x') as f:
        json.dump({'exitCode': result.returncode}, f)
    result.check_returncode()
    return target.read_bytes() if not binary else None

def inventory(rev, label):
    commit = run(label + '-commit', ['git', 'rev-parse', '--verify', rev + '^{commit}']).decode().strip()
    raw = run(label + '-tree', ['git', 'ls-tree', '-rz', commit])
    entries = {}
    for row in raw.split(b'\0'):
        if not row:
            continue
        meta, path = row.split(b'\t', 1)
        name = path.decode()
        mode, kind, oid = meta.decode().split()
        if name.split('/', 1)[0] in roots or name in files:
            assert kind == 'blob', (name, kind)
            assert not name.startswith(('docs/', 'output/'))
            entries[name] = {'mode': mode, 'gitBlob': oid}
    return commit, entries

revision, entries = inventory(a.revision, 'revision')
base, old = inventory(a.base, 'base') if a.base else (None, {})
changed = sorted(name for name in entries if entries[name] != old.get(name))
deleted = sorted(set(old) - set(entries))
manifest = {'revision': revision, 'base': base, 'entries': entries,
            'archivePaths': changed, 'deletedPaths': deleted,
            'scope': 'Allowlisted runtime, tests, assets, tools, plan and build config. No docs or output.',
            'applyRule': 'For delta, verify destination matches base first; delete listed paths, extract archive, then verify EVERY final entry. Preserve unrelated run evidence.'}
if not a.inventory_only and changed:
    run('archive', ['git', 'archive', '--format=tar', revision, '--', *changed], binary=True)
    manifest['archiveSha256'] = hashlib.sha256((out / 'source.tar').read_bytes()).hexdigest()
with (out / 'manifest.json').open('x') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
print(json.dumps({'revision': revision, 'entries': len(entries), 'changed': len(changed), 'deleted': len(deleted), 'output': str(out)}))
